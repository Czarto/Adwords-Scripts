// Version: Kunta

/***********

MIT License

Copyright (c) 2016-2019 Alex Czartoryski

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

var LABEL_PROCESSING_DESKTOP = "_processing_desktop";
var LABEL_PROCESSING_MOBILE = "_processing_mobile";
var LABEL_PROCESSING_TABLET = "_processing_tablet";

var BID_INCREMENT = 0.05;       // Raise and Lower bids by this value
var DEBUG = false;

var MIN_CONVERSIONS = 10;    // Minimum conversions needed to adjust bids.

var MAX_COST = 100;    // How much is too much. TODO: Decrease modifier if costs are above a threshold
var MAX_BID_ADJUSTMENT = 1.90; // Do not increase adjustments above +90%



function main() {
    initLabels(); // Create Labels

    setDeviceBidModifier("LAST_7_DAYS");
    setDeviceBidModifier("LAST_14_DAYS");
    setDeviceBidModifier("LAST_30_DAYS");
    setDeviceBidModifier(LAST_YEAR(), TODAY());

    cleanup(); // Remove Labels
}


//
// Set the Processing label
//
function initLabels() {
    checkLabelExists();
    cleanup();

    var itemsToLabel = [AdWordsApp.campaigns(), AdWordsApp.shoppingCampaigns()];

    for (i = 0; i < itemsToLabel.length; i++) {
        var iterator = itemsToLabel[i].get();

        while (iterator.hasNext()) {
            campaign = iterator.next();
            campaign.applyLabel(LABEL_PROCESSING_DESKTOP);
            campaign.applyLabel(LABEL_PROCESSING_MOBILE);
            campaign.applyLabel(LABEL_PROCESSING_TABLET);
        }
    }
}



//
// Create the processing label if it does not exist
//
function checkLabelExists() {

    var labels = [LABEL_PROCESSING_DESKTOP, LABEL_PROCESSING_MOBILE, LABEL_PROCESSING_TABLET];

    for (i = 0; i < labels.length; i++) {
        var labelIterator = AdWordsApp.labels().withCondition("Name = '" + labels[i] + "'").get();
        if (!labelIterator.hasNext()) {
            AdWordsApp.createLabel(labels[i], "AdWords Scripts label used to process bids");
        }
    }
}


//
// Remove Processing label
//
function cleanup() {
    var cleanupList = [AdWordsApp.campaigns(), AdWordsApp.shoppingCampaigns()];

    for (i = 0; i < cleanupList.length; i++) {
        var iterator = cleanupList[i].get();

        while (iterator.hasNext()) {
            campaign = iterator.next();
            campaign.removeLabel(LABEL_PROCESSING_DESKTOP);
            campaign.removeLabel(LABEL_PROCESSING_MOBILE);
            campaign.removeLabel(LABEL_PROCESSING_TABLET);
        }
    }
}


// Mobile Bids
function setDeviceBidModifier(dateRange, dateRangeEnd) {

    var campaignTypes = [AdWordsApp.campaigns(), AdWordsApp.shoppingCampaigns()];

    for (i = 0; i < campaignTypes.length; i++) {

        var labels = [LABEL_PROCESSING_DESKTOP, LABEL_PROCESSING_MOBILE, LABEL_PROCESSING_TABLET];
        for (l = 0; l < labels.length; l++) {
            var campaignIterator = campaignTypes[i].forDateRange(dateRange, dateRangeEnd)
                .withCondition("Status = ENABLED")
                .withCondition("Conversions >= " + MIN_CONVERSIONS)
                .withCondition("LabelNames CONTAINS_ANY ['" + labels[l] + "']")
                .get();

            Logger.log(' ');
            Logger.log('### ADJUST MOBILE TARGETING BIDS ###');
            Logger.log('Total Campaigns found : ' + campaignIterator.totalNumEntities());

            while (campaignIterator.hasNext()) {
                var campaign = campaignIterator.next();
                var baseConversionRate = campaign.getStatsFor(dateRange, dateRangeEnd).getConversionRate();
                var platforms = [campaign.targeting().platforms().desktop(),
                campaign.targeting().platforms().mobile(),
                campaign.targeting().platforms().tablet()
                ];

                Logger.log(' ');
                Logger.log('CAMPAIGN: ' + campaign.getName());


                var targetIterator = platforms[l].get();
                if (targetIterator.hasNext()) {
                    var target = targetIterator.next();
                    var stats = target.getStatsFor(dateRange, dateRangeEnd);
                    var conversions = stats.getConversions();
                    var conversionRate = stats.getConversionRate();
                    var targetModifier = (conversionRate / baseConversionRate);
                    var currentModifier = target.getBidModifier();

                    if (conversions >= MIN_CONVERSIONS) {
                        if (Math.abs(currentModifier - targetModifier) >= BID_INCREMENT) {
                            if (targetModifier > currentModifier) {
                                // Increase Modifier
                                target.setBidModifier(Math.min(currentModifier + BID_INCREMENT, MAX_BID_ADJUSTMENT));
                            } else {
                                // Decrease Modifier
                                target.setBidModifier(Math.max(currentModifier - BID_INCREMENT, 0.1));
                            }
                        }

                        campaign.removeLabel(labels[l]);
                    }
                }

            }
        }
    }
}



//
// Returns true if a bid increase is needed, false otherwise
//
function isBidIncreaseNeeded(stats, currentBid, baseConversionRate) {
    var conversions = stats.getConversions();
    var conversionRate = stats.getConversionRate();
    var targetBid = (conversionRate / baseConversionRate)

    if ((Math.abs(currentBid - targetBid) >= BID_INCREMENT)) {
        var isIncreaseNeeded = (targetBid > currentBid
            && currentBid < MAX_BID_ADJUSTMENT
            && conversions >= MIN_CONVERSIONS);

        if (DEBUG) {
            Logger.log('          ^ Is increase needed? ' + isIncreaseNeeded
                + ':: targetBid:' + targetBid + ' currentBid:' + currentBid
                + ':: conversionRate:' + conversionRate + ' baseline:' + baseConversionRate
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

    if ((Math.abs(currentBid - targetBid) >= BID_INCREMENT)) {
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


/*
** Helper function for log formatting
*/
function getName(object) {
    if (object.getEntityType() == 'AdSchedule') {
        return formatSchedule(object);
    } else {
        return object.getName();
    }
}


//
// Date formatting for logging
//
function formatSchedule(schedule) {
    function zeroPad(number) { return Utilities.formatString('%02d', number); }
    return schedule.getDayOfWeek() + ', ' +
        schedule.getStartHour() + ':' + zeroPad(schedule.getStartMinute()) +
        ' to ' + schedule.getEndHour() + ':' + zeroPad(schedule.getEndMinute());
}

function TODAY() {
    var today = new Date();
    var dd = today.getDate();
    var mm = today.getMonth() + 1; //January is 0!
    var yyyy = today.getFullYear();

    return { year: yyyy, month: mm, day: dd };
}

function LAST_YEAR() {
    var today = TODAY();

    today.year = today.year - 1;
    return today;
}
