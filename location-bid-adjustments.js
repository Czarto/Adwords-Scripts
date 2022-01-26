// Version: 2.3.2
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
var LABEL_IGNORE = '';

var BID_INCREMENT = 0.05;       // Value by which to adjust bids
var MIN_CONVERSIONS = 25;       // Minimum conversions needed to adjust bids.
var HIGH_COST = 500;            // or Adjust bids anyway if cost is above HIGH_COST
var MAX_BID_ADJUSTMENT = 2.00;  // Do not increase adjustments above this value
var MIN_BID_ADJUSTMENT = 0.10;  // Do not decrease adjustments below this value
// TODO: Instead of "high cost" use a "high CPA". If Conversions < Min Conversions, but CPA is high, then adjust. Otherwise leave alone.

function main() {
    initLabels(); // Create Labels

    Logger.log('Set Location Bids: 30 days');
    setLocationBids("LAST_30_DAYS");

    Logger.log('Set Location Bids: 90 days');
    setLocationBids(LAST_90_DAYS(), TODAY());

    Logger.log('Set Location Bids: Past Year');
    setLocationBids(LAST_YEAR(), TODAY());

    //Logger.log('Set Location Bids: All Time');
    //setLocationBids("ALL_TIME");

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

    Logger.log('Initializing labels...');
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
    Logger.log('Cleaning up...');

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

    // TODO: Just do one loop, with the campaign performance report.
    while (campaignIterator.hasNext()) {
        var campaign = campaignIterator.next();
        var campaignId = campaign.getId();

        // Get click and revenue data for the entire campaign
        var report = AdsApp.report(
            "SELECT CampaignId, CampaignName, Clicks, ConversionValue " +
            "FROM CAMPAIGN_PERFORMANCE_REPORT " +
            "WHERE CampaignId = " + campaignId + " " +
            " AND CampaignStatus = 'ENABLED' " + 
            "DURING " + dateRangeToString(dateRange, dateRangeEnd));
        
        var row = report.rows().next();
        var campaignId = row['CampaignId'];
        var campaignName = row['CampaignName'];
        var campaignClicks = row['Clicks'];
        var campaignRevenue = row['ConversionValue'].replace(',','');
        var campaignRevenuePerClick = (campaignClicks == 0 ? 0 : campaignRevenue/campaignClicks);


        // Get click and revenue data for each geo location
        var report = AdsApp.report(
            "SELECT Id, Clicks, Conversions, ConversionValue, Cost, BidModifier " +
            "FROM CAMPAIGN_LOCATION_TARGET_REPORT " +
            "WHERE Id > 0 AND CampaignId = " + campaignId + " " +
            "DURING " + dateRangeToString(dateRange, dateRangeEnd));        
        var reportRows = report.rows();

        while(reportRows.hasNext()) {
            var row = reportRows.next();
            var locationId = [[campaignId, row["Id"]]];
            var locationClicks = row['Clicks'];
            var locationConverions = row['Conversions'];
            var locationRevenue = row['ConversionValue'].replace(',','');
            var locationCost = row['Cost'].replace(',','');
            var locationBidModifier = (parseFloat(row['BidModifier']) / 100.0) + 1;
            var locationRevenuePerClick = (locationClicks == 0 ? 0 : locationRevenue/locationClicks);
 
            if (locationConverions >= MIN_CONVERSIONS || locationCost >= HIGH_COST ) {
                var newBidModifier = (locationRevenuePerClick / campaignRevenuePerClick)
                var isIncreaseNeeded = (newBidModifier > locationBidModifier && locationBidModifier < MAX_BID_ADJUSTMENT);
                var isDecreaseNeeded = (newBidModifier < locationBidModifier && locationBidModifier > MIN_BID_ADJUSTMENT);

                if( isIncreaseNeeded || isDecreaseNeeded ) {
                    var locationIterator = campaign.targeting().targetedLocations().withIds(locationId).get()
                    if( locationIterator.hasNext()) {
                        var location = locationIterator.next();
                        if( isIncreaseNeeded ) {
                            newBidModifier = Math.min(locationBidModifier + BID_INCREMENT, MAX_BID_ADJUSTMENT)
                            location.setBidModifier(newBidModifier);
                        } else if( isDecreaseNeeded ) {
                            newBidModifier = Math.max(locationBidModifier - BID_INCREMENT, MIN_BID_ADJUSTMENT);
                            location.setBidModifier(newBidModifier);
                        }
                    }
                }
            }
        }
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