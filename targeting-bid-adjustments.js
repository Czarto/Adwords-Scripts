// Version: Iota

var BID_INCREMENT = 0.05;
var DEBUG = false;
var TAG_IGNORE = '';


var LOCATION_IGNORE_COUNTRY = true; // Ignore location bid adjustments for Countries
var LOCATION_IGNORE_STATE = false;  // Ignore location bid adjustments for States or Provinces

var THRESHOLD_INCREASE = 10;    // Set this to 1 to increase bids more aggressively
var THRESHOLD_DECREASE = 1;    // Set this to 1 to decrease bids more aggressively

var HIGH_COST = 100;    // How much is too much

var STOPLIMIT_POSITION = 1.3; // Do not increase bids at this position or better
var STOPLIMIT_ADJUSTMENT = 1.50; // Do not increase adjustments above +50%

function main() {
    setLocationBids(LAST_YEAR(), TODAY());
    setAdScheduleBids(LAST_YEAR(), TODAY());
    setMobileBidModifier(LAST_YEAR(), TODAY());

    setLocationBids("LAST_30_DAYS");
    setAdScheduleBids("LAST_30_DAYS");
    setMobileBidModifier("LAST_30_DAYS");

    setLocationBids("LAST_14_DAYS");
    setMobileBidModifier("LAST_14_DAYS");

    setLocationBids("LAST_7_DAYS");
    setMobileBidModifier("LAST_7_DAYS");
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

            Logger.log('-----     ' + targetedLocation.getTargetType() + ':' + getName(targetedLocation));

            if (!(LOCATION_IGNORE_COUNTRY && targetedLocation.getTargetType() == "Country") &&
                !(LOCATION_IGNORE_STATE && (targetedLocation.getTargetType() == "State" || targetedLocation.getTargetType() == "Province"))) {
                var stats = targetedLocation.getStatsFor(dateRange, dateRangeEnd);
                var conversions = stats.getConversions();
                var cost = stats.getCost();
                var currentBidModifier = targetedLocation.getBidModifier();


                // At least 1 conversion
                if (conversions > 0) {
                    Logger.log('         ^ Convervions > 0');
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

                if (LOCATION_IGNORE_COUNTRY && targetedLocation.getTargetType() == "Country") {
                    message = message + 'Countries';
                } else if (LOCATION_IGNORE_STATE && (targetedLocation.getTargetType() == "State" || targetedLocation.getTargetType() == "Province")) {
                    message = message + 'States and Provinces';
                }

                Logger.log(message);
            }
        }
    }
}




function setAdScheduleBids(dateRange, dateRangeEnd) {

    var campaignIterator = getCampaignSelector(dateRange, dateRangeEnd).get();

    Logger.log(' ')
    Logger.log('### ADJUST AD SCHEDULE TARGETING BIDS ###');
    Logger.log('Total Campaigns found : ' + campaignIterator.totalNumEntities());

    setAdScheduleBidsForCampaigns(campaignIterator, dateRange, dateRangeEnd);

    // Adjust for Shopping campaigns
    var campaignIterator = getCampaignSelector(dateRange, dateRangeEnd, true).get();

    Logger.log(' ')
    Logger.log('Shopping Campaigns');
    Logger.log('Total Campaigns found : ' + campaignIterator.totalNumEntities());

    setAdScheduleBidsForCampaigns(campaignIterator, dateRange, dateRangeEnd);
}

/*
** Set schedule bid adjustments for all campaigns within the campaign iterator
*/
function setAdScheduleBidsForCampaigns(campaignIterator, dateRange, dateRangeEnd) {

    while (campaignIterator.hasNext()) {
        var campaign = campaignIterator.next();
        var campaignConvRate = campaign.getStatsFor(dateRange, dateRangeEnd).getConversionRate();

        Logger.log('-- CAMPAIGN: ' + campaign.getName());

        var iterator = campaign.targeting().adSchedules().get();

        Logger.log('----- Schedules found : ' + iterator.totalNumEntities());

        while (iterator.hasNext()) {
            var adSchedule = iterator.next();

            Logger.log('-----     ' + getName(adSchedule));

            var stats = adSchedule.getStatsFor(dateRange, dateRangeEnd);
            var conversions = stats.getConversions();
            var cost = stats.getCost();
            var currentBidModifier = adSchedule.getBidModifier();



            if (conversions > 0) {
                Logger.log('         ^ Convervions > 0');
                if (isBidIncreaseNeeded(stats, currentBidModifier, campaignConvRate)) {
                    increaseBid(adSchedule)
                } else if (isBidDecreaseNeeded(stats, currentBidModifier, campaignConvRate)) {
                    decreaseBid(adSchedule);
                }
            }


            // Zero Conversions, Hight Cost. Drop bids.
            if (conversions == 0 && cost > HIGH_COST) {
                Logger.log('        High Cost');
                decreaseBid(adSchedule);
            }
        }
    }
}



// Mobile Bids
function setMobileBidModifier(dateRange, dateRangeEnd) {

    var campaignIterator = getCampaignSelector(dateRange, dateRangeEnd).get();

    Logger.log(' ')
    Logger.log('### ADJUST MOBILE TARGETING BIDS ###');
    Logger.log('Total Campaigns found : ' + campaignIterator.totalNumEntities());

    setMobileBidModifierForCampaigns(campaignIterator, dateRange, dateRangeEnd)

    // Adjust for Shopping campaigns
    var campaignIterator = getCampaignSelector(dateRange, dateRangeEnd, true).get();

    Logger.log(' ')
    Logger.log('Shopping Campaigns');
    Logger.log('Total Campaigns found : ' + campaignIterator.totalNumEntities());

    setMobileBidModifierForCampaigns(campaignIterator, dateRange, dateRangeEnd);
}



function setMobileBidModifierForCampaigns(campaignIterator, dateRange, dateRangeEnd) {

    while (campaignIterator.hasNext()) {
        var campaign = campaignIterator.next();

        Logger.log(' ');
        Logger.log('CAMPAIGN: ' + campaign.getName());

        var desktopTargetIterator = campaign.targeting().platforms().desktop().get();
        var tabletTargetIterator = campaign.targeting().platforms().tablet().get();
        var mobileTargetIterator = campaign.targeting().platforms().mobile().get();

        if (desktopTargetIterator.hasNext()) {
            var desktopTarget = desktopTargetIterator.next();
            var desktopStats = desktopTarget.getStatsFor(dateRange, dateRangeEnd);
            var desktopConversionRate = desktopStats.getConversionRate();

            if (tabletTargetIterator.hasNext()) {
                var tabletTarget = tabletTargetIterator.next();
                var stats = tabletTarget.getStatsFor(dateRange, dateRangeEnd);
                var currentBidModifier = tabletTarget.getBidModifier();

                if (isBidIncreaseNeeded(stats, currentBidModifier, desktopConversionRate)) {
                    increaseBid(tabletTarget);
                } else if (isBidDecreaseNeeded(stats, currentBidModifier, desktopConversionRate)) {
                    decreaseBid(tabletTarget);
                }

            }

            if (mobileTargetIterator.hasNext()) {
                var mobileTarget = mobileTargetIterator.next();
                var stats = mobileTarget.getStatsFor(dateRange, dateRangeEnd);
                var currentBidModifier = mobileTarget.getBidModifier();


                if (isBidIncreaseNeeded(stats, currentBidModifier, desktopConversionRate)) {
                    increaseBid(mobileTarget);
                } else if (isBidDecreaseNeeded(stats, currentBidModifier, desktopConversionRate)) {
                    decreaseBid(mobileTarget);
                }

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
    var position = stats.getAveragePosition();
    var targetBid = (conversionRate / baselineConversionRate)

    if (isBidChangeSignificant(currentBid, targetBid)) {
        var isIncreaseNeeded = (targetBid > currentBid
            && (position > STOPLIMIT_POSITION || position == 0)
            && currentBid < STOPLIMIT_ADJUSTMENT
            && conversions >= THRESHOLD_INCREASE);

        if (DEBUG) {
            Logger.log('          ^ Is increase needed? ' + isIncreaseNeeded
                + ':: targetBid:' + targetBid + ' currentBid:' + currentBid
                + ':: conversionRate:' + conversionRate + ' baseline:' + baselineConversionRate
                + ':: position:' + position + ' stoplimit:' + STOPLIMIT_POSITION
                + ':: currentBid:' + currentBid + ' stoplimit:' + STOPLIMIT_ADJUSTMENT
                + ':: conversions:' + conversions + ' threshold:' + THRESHOLD_INCREASE);
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
        var isDecreaseNeeded = (targetBid < currentBid && conversions >= THRESHOLD_DECREASE);

        if (DEBUG) {
            Logger.log('          ^ Is decrease needed? ' + isDecreaseNeeded
                + ':: targetBid:' + targetBid + ' currentBid:' + currentBid
                + ':: conversionRate:' + conversionRate + ' baseline:' + baselineConversionRate
                + ':: conversions:' + conversions + ' threshold:' + THRESHOLD_DECREASE);
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
        .withCondition("Status = ENABLED");

    if (TAG_IGNORE.length > 0) {
        campaignSelector = campaignSelector
            .withCondition("LabelNames CONTAINS_NONE ['" + TAG_IGNORE + "']");
    }

    return campaignSelector;
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
