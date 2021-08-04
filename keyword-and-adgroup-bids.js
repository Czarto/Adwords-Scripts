// Version: V2.2

/***********

MIT License

Copyright (c) 2016-2017 Alex Czartoryski

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

var CONVERSION_VALUE = 40.0; // Your average order value
var HIGHCOST_VALUE = CONVERSION_VALUE; // How much is too much, before you lower your bids
var USE_ACTUAL_CONVERSION_VALUE = true;
var PROFIT_MARGIN = 0.4; // Percentage. The maximum percentage of sales you are willing to spend

var MAX_BID_INCREASE = 0.1;  // Max bid increase in Dollars
var MIN_CONVERSIONS = 5;    // Minimum number of conversions to make a bid increase. Set this to 1 to increase bids most aggressively

var MIN_BID = 0.01; // The minimum bid to decrease to

var AGGRESSIVE_BIDDING = false;   // Don't lower bids unless the current CPA is over  HIGHCOST_VALUE or MAX_COS

// LABELS
var LABEL_PROCESSING = 'Processing';
var TAG_IGNORE = 'Script Ignore';
var TAG_INCLUDE = '';

// CAMPAIGN FILTERS
var CAMPAIGN_INCLUDE = ''; // Only include Adgroups and keywords in Campaigns with this text string in the name
var CAMPAIGN_EXCLUDE = ''; // Exclude Adgroups and keywords in Campaigns with this text string in the name


// TODO: Review CONVERSION_VALUE vs HIGHCOST_VALUE vs PROFIT_MARGIN vs SALES_VALUE
// TODO: Set keyword bids to adgroup bids when they are within range
// TODO: Set keywords bids to adgroup bids when they are "low volume"
// TODO: Set keywords bids to adgroup bids if they are below threshold, but conversion rate warrents it
// TODO: (Last) Increase bids to top of page, if low volume, low cost, and has not been processed yet.
// TODO: (Last) Increase bids to first page, if low volume, low cost, and has not been processed yet.
// TODO: Check if 'Script Ignore' works

function main() { 
  initLabels();
  
  Logger.log('\n***** 7 DAYS *****');
  setAdGroupsToMax("LAST_7_DAYS");
  decreaseHighCostAdGroups("LAST_7_DAYS");
  
  Logger.log('\n***** 14 DAYS *****');
  setAdGroupsToMax("LAST_14_DAYS");
  decreaseHighCostAdGroups("LAST_14_DAYS");

  
  Logger.log('\n***** 30 DAYS *****');
  setAdGroupsToMax("LAST_30_DAYS");
  decreaseHighCostAdGroups("LAST_30_DAYS");

  
  Logger.log('\n***** 90 DAYS *****');
  setAdGroupsToMax(LAST_90_DAYS(), TODAY());
  decreaseHighCostAdGroups(LAST_90_DAYS(), TODAY());

  
  Logger.log('\n***** 1 YEAR *****');
  setAdGroupsToMax(LAST_YEAR(), TODAY());
  decreaseHighCostAdGroups(LAST_YEAR(), TODAY());

  cleanup();
}


//
// Set the Processing label
//
function initLabels() {
  checkLabelExists();

  var itemsToLabel = [AdWordsApp.adGroups(), AdWordsApp.shoppingAdGroups()];

  for (i = 0; i < itemsToLabel.length; i++) {
    var iterator = getSelector(itemsToLabel[i]).get();

    while (iterator.hasNext()) {
      iterator.next().applyLabel(LABEL_PROCESSING);
    }
  }
}

//
// Create the processing label if it does not exist
//
function checkLabelExists() {
  var labelIterator = AdWordsApp.labels()
    .withCondition("Name = '" + LABEL_PROCESSING + "'" )
    .get();

  if( !labelIterator.hasNext()) {
    AdWordsApp.createLabel(LABEL_PROCESSING, "AdWords Scripts label used to process bids")
  }

  var labelIterator = AdWordsApp.labels()
  .withCondition("Name = '" + TAG_IGNORE + "'" )
  .get();

  if( !labelIterator.hasNext()) {
    AdWordsApp.createLabel(TAG_IGNORE, "AdWords Scripts label used to ignore script processing")
  } 
}


//
// Remove Processing label
//
function cleanup() {
  var cleanupList = [AdWordsApp.adGroups(), AdWordsApp.shoppingAdGroups()];

  for (i = 0; i < cleanupList.length; i++) {
    // Cleanup AdGoups
    var iterator = cleanupList[i].withCondition("LabelNames CONTAINS_ANY ['" + LABEL_PROCESSING + "']").get();

    while (iterator.hasNext()) {
      iterator.next().removeLabel(LABEL_PROCESSING);
    }
  }
}

//
// Increase AdGroup bids to maximum supported by conversion value
//
function setAdGroupsToMax(dateRange, dateRangeEnd) {
  Logger.log('increaseAdGroupsToMax');

  var adGroupTypes = [AdWordsApp.adGroups(), AdWordsApp.shoppingAdGroups()];

  for (i = 0; i < adGroupTypes.length; i++) {
    // Only process adGroups that have:
    //  - More conversions than MIN_CONVERSIONS
    //  - Are marked for Processing
    //  - Have at least one click
    //  - And who's avg position is worst than the StopLimit
    var adGroupIterator = adGroupTypes[i]
      .forDateRange(dateRange, dateRangeEnd)
      .withCondition("Conversions >= " + MIN_CONVERSIONS)
      .withCondition("LabelNames CONTAINS_ANY ['" + LABEL_PROCESSING + "']")
      .withCondition("Clicks > 0");
    adGroupIterator = adGroupIterator.get();

    Logger.log('Total adGroups found : ' + adGroupIterator.totalNumEntities());

    while (adGroupIterator.hasNext()) {
      var adGroup = adGroupIterator.next();
      var stats = adGroup.getStatsFor(dateRange, dateRangeEnd);
      var cost = stats.getCost();
      var clicks = stats.getClicks();
      var current_cpc = adGroup.bidding().getCpc();
      var conversionValue = getAdGroupConversionValue(adGroup, dateRange, dateRangeEnd);
      var costOfSales = cost / conversionValue;
      max_cpc = getMaxCpcBid(current_cpc, conversionValue, clicks);

      // If Aggressive bidding is set, only lower the bid if costOfSales is too high
      if( AGGRESSIVE_BIDDING && costOfSales < PROFIT_MARGIN ) {
        max_cpc = Math.max(max_cpc, current_cpc);
      }

      adGroup.bidding().setCpc(max_cpc);

      // Remove processing label even if no changes made, as the keyword
      // is still performing well, so we don't want further back looking
      // functions to reduce the bid
      adGroup.removeLabel(LABEL_PROCESSING);
    }
  }
}


//
// Get the total Conversion Value for this adgroup and date range
//
function getAdGroupConversionValue(adGroup, dateRange, dateRangeEnd) {
  var reportName = "ADGROUP_PERFORMANCE_REPORT";
  if( adGroup.getEntityType == "ShoppingAdGroup") {
    reportName = "SHOPPING_PERFORMANCE_REPORT";
  }

  var report = AdWordsApp.report(
      "SELECT ConversionValue, Conversions " +
      "FROM " + reportName + " " +
      "WHERE AdGroupId = " + adGroup.getId() + " " +
      "DURING " + dateRangeToString(dateRange, dateRangeEnd));

      var convVals = report.rows();

      if(convVals.hasNext()) {
        var data = convVals.next();
        var conversions = parseFloat(data.Conversions);
        var conversionValue = parseFloat(data.ConversionValue.replace(',',''));
        
        if( USE_ACTUAL_CONVERSION_VALUE ) {
          return conversionValue;
        } else {
          return conversions * CONVERSION_VALUE;
        }
      } else {
        return 0
      }
}


// 
// Reset high cost AdGroups
// 
function decreaseHighCostAdGroups(dateRange, dateRangeEnd) {

  Logger.log('\nHigh Cost AdGroups : ' + dateRangeToString(dateRange, dateRangeEnd));

  var adGroupTypes = [AdWordsApp.adGroups(), AdWordsApp.shoppingAdGroups()];

  for (i = 0; i < adGroupTypes.length; i++) {
    // Only process adGroups that have:
    //  - Less conversions than MIN_CONVERSIONS
    //  - Are marked for Processing
    //  - Have at least one click
    //  - And who have a high cost
    var adGroupIterator = adGroupTypes[i]
      .forDateRange(dateRange, dateRangeEnd)
      .withCondition("Conversions < " + MIN_CONVERSIONS)
      .withCondition("LabelNames CONTAINS_ANY ['" + LABEL_PROCESSING + "']")
      .withCondition("Clicks > 0")
      .withCondition("Cost > " + HIGHCOST_VALUE)
      .get();

    Logger.log('Total adGroups found : ' + adGroupIterator.totalNumEntities());

    while (adGroupIterator.hasNext()) {
      var adGroup = adGroupIterator.next();
      var stats = adGroup.getStatsFor(dateRange, dateRangeEnd);
      var clicks = stats.getClicks();
      var current_cpc = adGroup.bidding().getCpc();
      // Add default value of a conversion, to calculate new max CPC optimistically that we
      // might get an average conversion on the next click
      var conversionValue = getAdGroupConversionValue(adGroup, dateRange, dateRangeEnd);
      conversionValue = conversionValue + CONVERSION_VALUE;

      max_cpc = getMaxCpcBid(current_cpc, conversionValue, clicks);

      if( max_cpc < current_cpc) {
        adGroup.bidding().setCpc(max_cpc);
        // Do not remove processing label. Give a chance for more data
        // to increase the bid
        //adGroup.removeLabel(LABEL_PROCESSING);
      }
    }
  }
}



//
// Return Keyword or AdGroup Selector, filtered by Campaign filters
//
function getSelector(selector) {
 var aSelector = selector
      .withCondition("Status = ENABLED")
      .withCondition("CampaignStatus = ENABLED")
      .withCondition("AdGroupStatus = ENABLED");
  
  
  if( TAG_INCLUDE.length > 0 ) {
    aSelector = aSelector.withCondition("LabelNames CONTAINS_ALL ['" + TAG_INCLUDE + "']");
  }

  if( TAG_IGNORE.length > 0 ) {
    aSelector = aSelector.withCondition("LabelNames CONTAINS_NONE ['" + TAG_IGNORE + "']");
  }
 
  if( CAMPAIGN_INCLUDE.length > 0 ) {
    aSelector = aSelector.withCondition("CampaignName CONTAINS_IGNORE_CASE '" + CAMPAIGN_INCLUDE + "'");    
  }

  if( CAMPAIGN_EXCLUDE.length > 0 ) {
    aSelector = aSelector.withCondition("CampaignName DOES_NOT_CONTAIN_IGNORE_CASE '" + CAMPAIGN_EXCLUDE + "'");
  }
  
  return aSelector;
}


//
// Return the max COC bid based on the current bid, conversion value, and num clicks
//
function getMaxCpcBid(current_cpc, conversionValue, clicks)
{
  var MaxBidIncreaseLimit = current_cpc + MAX_BID_INCREASE;
  var ProfitMarginLimit = (conversionValue / clicks) * PROFIT_MARGIN;

  var maxCpcBid = Math.min(MaxBidIncreaseLimit, ProfitMarginLimit);

  // Ensure bid is above 0.01 or MIN_BID
  return Math.max(maxCpcBid, MIN_BID, 0.01);
}


//
// Date range helper functions
// Returns today's date.
//
function TODAY() {
  var today = new Date();
  var dd = today.getDate();
  var mm = today.getMonth()+1; //January is 0!
  var yyyy = today.getFullYear();

  return {year: yyyy, month: mm, day: dd};
}


//
// Date range helper functions
// Returns date 1 year ago
//
function LAST_YEAR() {
  var today = TODAY();
  
  today.year = today.year-1;
  return today;
}


//
// Date range helper functions
// Returns date 90 days ago
//
function LAST_90_DAYS() {
  var date = new Date(); 
  date.setDate(date.getDate() - 90);
  
  var dd = date.getDate();
  var mm = date.getMonth()+1; //January is 0!
  var yyyy = date.getFullYear();

  return {year: yyyy, month: mm, day: dd};
}

//
// Date range helper function - Reports
// Returns a date range that will work in the DURING clause of the reporting query langugae
//
function dateRangeToString(dateRange, dateRangeEnd) {
  if( dateRange == "LAST_7_DAYS" || dateRange == "LAST_14_DAYS" || dateRange == "LAST_30_DAYS") {
    return dateRange;
  } else {
   return dateRange.year.toString() + ("0" + dateRange.month).slice(-2) + ("0" + dateRange.day).slice(-2) + ","
           + dateRangeEnd.year.toString() + ("0" + dateRangeEnd.month).slice(-2) + ("0" + dateRangeEnd.day).slice(-2);
  }
}

