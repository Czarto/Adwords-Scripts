// Version: 2.0
// Latest Source: https://github.com/Czarto/Adwords-Scripts/blob/master/device-bid-adjustments.js
//
// This Google Ads Script will incrementally change location bid adjustments
// based on conversion Value Per Click (VPC) using the Campaign's average VPC
// as a baseline.
//

/***********

MIT License

Copyright (c) 2016-2022 Alex Czartoryski

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

**********/

var LABEL_PROCESSING = "_processing_location";
var DEBUG = false;
var LABEL_IGNORE = '';

var BID_INCREMENT = 0.05;       // Value by which to adjust bids
var MIN_CONVERSIONS = 50;       // Minimum conversions needed to adjust bids.
var HIGH_COST = 500;    // How much is too much
var MAX_BID_ADJUSTMENT = 1.90;  // Do not increase adjustments above this value
var MIN_BID_ADJUSTMENT = 0.10;  // Do not decrease adjustments below this value


var LOCATION_IGNORE_COUNTRY = true; // Ignore location bid adjustments for Countries
var LOCATION_IGNORE_STATE = false;  // Ignore location bid adjustments for States or Provinces

var ADJUST_COUNTRY = false;
var ADJUST_STATE = true;
var ADJUST_CITY = true;


function main() {
    initLabels(); // Create Labels

    setLocationBids("LAST_30_DAYS");
    setLocationBids(LAST_YEAR(), TODAY());
    setLocationBids("ALL_TIME");

    cleanup(); // Remove Labels
}


//
// Set the Processing label
// This keeps track of which bid adjustments have already been processed
// in the case where multiple time-lookback windows are being used
//
function initLabels() {
    checkLabelExists();
    cleanup();

    var itemsToLabel = [AdsApp.campaigns(), AdsApp.shoppingCampaigns()];

    for (i = 0; i < itemsToLabel.length; i++) {
        var iterator = itemsToLabel[i].withCondition("Status = ENABLED").get();

        while (iterator.hasNext()) {
            iterator.next().applyLabel(LABEL_PROCESSING);
        }
    }
}



//
// Create the processing label if it does not exist
//
function checkLabelExists() {
    var labelIterator = AdsApp.labels().withCondition("Name = '" + LABEL_PROCESSING + "'" ).get();

    if( !labelIterator.hasNext()) {
        AdsApp.createLabel(LABEL_PROCESSING, "AdWords Scripts label used to process bids")
    }
}


//
// Remove Processing label
//
function cleanup() {
    var cleanupList = [AdsApp.campaigns(), AdsApp.shoppingCampaigns()];

    for (i = 0; i < cleanupList.length; i++) {
      var iterator = cleanupList[i].withCondition("LabelNames CONTAINS_ANY ['" + LABEL_PROCESSING + "']").get();
  
      while (iterator.hasNext()) {
        iterator.next().removeLabel(LABEL_PROCESSING);
      }
    }
}


function setLocationBids(dateRange, dateRangeEnd) {

    // Adjust for normal campaigns
    var campaignIterator = getCampaignSelector(dateRange, dateRangeEnd).get();

    Logger.log(' ')
    Logger.log('### ADJUST LOCATION TARGETING BIDS ###');
    Logger.log('Non-Shopping Campaigns');
    Logger.log('Total Campaigns found : ' + campaignIterator.totalNumEntities());

    setLocationBidsForCampaigns(campaignIterator, dateRange, dateRangeEnd);

    // Adjust for Shopping campaigns
    var campaignIterator = getCampaignSelector(dateRange, dateRangeEnd, true).get();

    Logger.log(' ')
    Logger.log('Shopping Campaigns');
    Logger.log('Total Campaigns found : ' + campaignIterator.totalNumEntities());

    setLocationBidsForCampaigns(campaignIterator, dateRange, dateRangeEnd);
}


//
// Sets the location bids for all the campaigns within the CampaignIterator.
//
function setLocationBidsForCampaigns(campaignIterator, dateRange, dateRangeEnd) {

    while (campaignIterator.hasNext()) {
        var campaign = campaignIterator.next();
        var campaignConvRate = campaign.getStatsFor(dateRange, dateRangeEnd).getConversionRate();

        Logger.log('-- CAMPAIGN: ' + campaign.getName());

        var iterator = campaign.targeting().targetedLocations().get();

        Logger.log('----- Locations found : ' + iterator.totalNumEntities());

        while (iterator.hasNext()) {
            var targetedLocation = iterator.next();

            Logger.log('-----     ' + targetedLocation.getTargetType() + ':' + targetedLocation.getName());

            if ((ADJUST_COUNTRY && targetedLocation.getTargetType() == "Country") ||
                (ADJUST_STATE && (targetedLocation.getTargetType() == "State" || targetedLocation.getTargetType() == "Province" || targetedLocation.getTargetType() == "Territory")) ||
                (ADJUST_CITY && targetedLocation.getTargetType() == "City")) {
                var stats = targetedLocation.getStatsFor(dateRange, dateRangeEnd);
                var conversions = stats.getConversions();
                var cost = stats.getCost();
                var currentBidModifier = targetedLocation.getBidModifier();

                // At least 1 conversion
                if (conversions > 0) {
                    if (DEBUG) { Logger.log('         ^ Convervions > 0') };
                    if (isBidIncreaseNeeded(stats, currentBidModifier, campaignConvRate)) {
                        increaseBid(targetedLocation);
                    } else if (isBidDecreaseNeeded(stats, currentBidModifier, campaignConvRate)) {
                        decreaseBid(targetedLocation);
                    }
                }

                // Zero Conversions, Hight Cost. Drop bids.        
                if (conversions == 0 && cost > HIGH_COST) {
                    Logger.log('        High Cost');
                    decreaseBid(targetedLocation);
                }
            } else {
                var message = '-----     ^ Ignoring ';

                if (ADJUST_COUNTRY == false && targetedLocation.getTargetType() == "Country") {
                    message = message + 'Countries';
                } else if (ADJUST_STATE == false && (targetedLocation.getTargetType() == "State" || targetedLocation.getTargetType() == "Province"  || targetedLocation.getTargetType() == "Territory")) {
                    message = message + 'States and Provinces';
                } else if (ADJUST_CITY == false && targetedLocation.getTargetType() == "City") {
                    message = message + 'Cities';
                }
                
                Logger.log(message);
            }
        }
    }
}


//
// Returns true if a bid increase is needed, false otherwise
//
function isBidIncreaseNeeded(stats, currentBid, baselineConversionRate) {
    var conversions = stats.getConversions();
    var conversionRate = stats.getConversionRate();
    var targetBid = (conversionRate / baselineConversionRate)

    if (isBidChangeSignificant(currentBid, targetBid)) {
        var isIncreaseNeeded = (targetBid > currentBid
            && currentBid < MAX_BID_ADJUSTMENT
            && conversions >= MIN_CONVERSIONS);

        if (DEBUG) {
            Logger.log('          ^ Is increase needed? ' + isIncreaseNeeded
                + ':: targetBid:' + targetBid + ' currentBid:' + currentBid
                + ':: conversionRate:' + conversionRate + ' baseline:' + baselineConversionRate
                + ':: currentBid:' + currentBid + ' stoplimit:' + MAX_BID_ADJUSTMENT
                + ':: conversions:' + conversions + ' threshold:' + MIN_CONVERSIONS);
        }

        return (isIncreaseNeeded);
    } else {
        return false;
    }
}


//
// Returns true if a bid decrease is needed, false otherwise
//
function isBidDecreaseNeeded(stats, currentBid, baselineConversionRate) {
    var conversions = stats.getConversions();
    var conversionRate = stats.getConversionRate();
    var targetBid = (conversionRate / baselineConversionRate)

    if (isBidChangeSignificant(currentBid, targetBid)) {
        var isDecreaseNeeded = (targetBid < currentBid && conversions >= MIN_CONVERSIONS);

        if (DEBUG) {
            Logger.log('          ^ Is decrease needed? ' + isDecreaseNeeded
                + ':: targetBid:' + targetBid + ' currentBid:' + currentBid
                + ':: conversionRate:' + conversionRate + ' baseline:' + baselineConversionRate
                + ':: conversions:' + conversions + ' threshold:' + MIN_CONVERSIONS);
        }

        return (isDecreaseNeeded);
    } else {
        return false;
    }
}



//
// returns true if the difference between the two bids is >= BID_INCREMENT
//
function isBidChangeSignificant(bid1, bid2) {
    var isSignificant = (Math.abs(bid1 - bid2) >= BID_INCREMENT);

    if (DEBUG) {
        Logger.log('          ^ Is bid change significant? BID1:' + bid1 + ' BID2:' + bid2 + ' :: ' + isSignificant);
    }

    return (isSignificant)
}



//
// Increase bid adjustments by the default amount
//
function increaseBid(target) {
    var newBidModifier = target.getBidModifier() + BID_INCREMENT;
    target.setBidModifier(newBidModifier);

    if (DEBUG) {
        Logger.log('*** UPDATE *** ' + target.getEntityType() + ' : ' + getName(target)
            + ', bid modifier: ' + newBidModifier
            + ' increase bids');
    }
}



//
// Decrease bid adjustments by the default amount
//
function decreaseBid(target) {
    var newBidModifier = target.getBidModifier() - BID_INCREMENT;
    newBidModifier = Math.max(newBidModifier, 0.1); // Modifier cannot be less than 0.1 (-90%)

    // TODO: Reset bid modifier to 0% (1.0) if the current conversion rate is below avg conversion rate
    // var newBidModifier = Math.min(currentBidModifier - BID_INCREMENT, 1);

    target.setBidModifier(newBidModifier);

    if (DEBUG) {
        Logger.log('*** UPDATE *** ' + target.getEntityType() + ' : ' + getName(target)
            + ', bid modifier: ' + newBidModifier
            + ' decrease bids');
    }
}


//
// Returns the CampaignIterator object
//
function getCampaignSelector(dateRange, dateRangeEnd, isShopping) {
    var campaignSelector = isShopping ? AdWordsApp.shoppingCampaigns() : AdWordsApp.campaigns();

    campaignSelector = campaignSelector
        .forDateRange(dateRange, dateRangeEnd)
        .withCondition("Status = ENABLED")
        .withCondition("LabelNames CONTAINS_ANY ['" + LABEL_PROCESSING + "']");

    if (LABEL_IGNORE.length > 0) {
        campaignSelector = campaignSelector
            .withCondition("LabelNames CONTAINS_NONE ['" + LABEL_IGNORE + "']");
    }

    return campaignSelector;
}

//
// Date range helper function
// Returns today's date
//
function TODAY() {
    var today = new Date();
    var dd = today.getDate();
    var mm = today.getMonth() + 1; // 0-11
    var yyyy = today.getFullYear();

    return { year: yyyy, month: mm, day: dd };
}

//
// Date range helper functions
// Returns date 90 days ago
//
function LAST_90_DAYS() {
    var date = new Date(); 
    date.setDate(date.getDate() - 90);
    
    var dd = date.getDate();
    var mm = date.getMonth()+1; // 0-11
    var yyyy = date.getFullYear();
  
    return {year: yyyy, month: mm, day: dd};
  }

//
// Date range helper functions
// Returns date 1 year ago
//
function LAST_YEAR() {
    var today = TODAY();

    today.year = today.year - 1;
    return today;
}


//
// Date range helper function - Reports
// Returns a date range that will work in the DURING clause of the reporting query langugae
//
function dateRangeToString(dateRange, dateRangeEnd) {
    if( dateRange == "LAST_7_DAYS" || dateRange == "LAST_14_DAYS" || dateRange == "LAST_30_DAYS" ) {
      return dateRange;
    } else if (dateRange == "ALL_TIME" ) {
      return "20000101," + TODAY().year.toString() + ("0" + TODAY().month).slice(-2) + ("0" + TODAY().day).slice(-2);
    } else {
      return dateRange.year.toString() + ("0" + dateRange.month).slice(-2) + ("0" + dateRange.day).slice(-2) + ","
             + dateRangeEnd.year.toString() + ("0" + dateRangeEnd.month).slice(-2) + ("0" + dateRangeEnd.day).slice(-2);
    }
  }