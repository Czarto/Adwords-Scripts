// Version: V3.0 New Script Experience

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

var AVG_CONV_VALUE = 40.0; // Average conversion value.
var HIGH_COST_THRESHOLD = AVG_CONV_VALUE; // How much is too much, before you lower your bids
var USE_ACTUAL_CONVERSION_VALUE = true;

// Performance Targets
var MIN_ROAS = 4.0        // Minium Return on Ad Spend
var MAX_COS = 1/MIN_ROAS; // Maximum Ad Spend as a % Cost of Sales.

var MAX_BID_INCREASE = 0.10; // Bids will be increased by at most this amount.
var MIN_BID = 0.05;         // The minimum CPC bid to decrease to
var MIN_CONVERSIONS = 5;    // Minimum number of conversions required to make a bid increase.

var AGGRESSIVE_BIDDING = false;   // When set to true, bids will not be lowered unless the current CPA is over MAX_COSHIGHCOST_VALUE or MAX_COS

// LABELS
var LABEL_PROCESSING = 'Processing';
var TAG_IGNORE = '';
var TAG_INCLUDE = '';

// CAMPAIGN FILTERS
var CAMPAIGN_INCLUDE = ''; // Only include Adgroups and keywords in Campaigns with this text string in the name
var CAMPAIGN_EXCLUDE = ''; // Exclude Adgroups and keywords in Campaigns with this text string in the name

// TODO: Only process enabled campaigns/ad groups


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

  var itemsToLabel = [AdsApp.adGroups(), AdsApp.shoppingAdGroups()];

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
  var labelIterator = AdsApp.labels()
    .withCondition("Name = '" + LABEL_PROCESSING + "'" )
    .get();

  if( !labelIterator.hasNext()) {
    AdsApp.createLabel(LABEL_PROCESSING, "AdWords Scripts label used to process bids")
  }

  var labelIterator = AdsApp.labels()
  .withCondition("Name = '" + TAG_IGNORE + "'" )
  .get();

  if( !labelIterator.hasNext()) {
    AdsApp.createLabel(TAG_IGNORE, "AdWords Scripts label used to ignore script processing")
  } 
}


//
// Remove Processing label
//
function cleanup() {
  var cleanupList = [AdsApp.adGroups(), AdsApp.shoppingAdGroups()];

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

  var adGroupTypes = [AdsApp.adGroups(), AdsApp.shoppingAdGroups()];

  for (i = 0; i < adGroupTypes.length; i++) {
    // Only process adGroups that have:
    //  - More conversions than MIN_CONVERSIONS
    //  - Are marked for Processing
    //  - Have at least one click
    //  - And who's avg position is worst than the StopLimit
    var adGroupIterator = adGroupTypes[i]
      .forDateRange(dateRange, dateRangeEnd)
      .withCondition("Conversions > " + (MIN_CONVERSIONS-1))
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
      if( AGGRESSIVE_BIDDING && costOfSales < MAX_COS ) {
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

  var report = AdsApp.report(
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
      return conversions * AVG_CONV_VALUE;
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

  var adGroupTypes = [AdsApp.adGroups(), AdsApp.shoppingAdGroups()];

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
      .withCondition("Cost > " + HIGH_COST_THRESHOLD)
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
      conversionValue = conversionValue + AVG_CONV_VALUE;

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
  var ProfitMarginLimit = (conversionValue / clicks) * MAX_COS;

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
  if( dateRange == "LAST_7_DAYS" || dateRange == "LAST_14_DAYS" || dateRange == "LAST_30_DAYS" || dateRange == "ALL_TIME") {
    return dateRange;
  } else {
   return dateRange.year.toString() + ("0" + dateRange.month).slice(-2) + ("0" + dateRange.day).slice(-2) + ","
           + dateRangeEnd.year.toString() + ("0" + dateRangeEnd.month).slice(-2) + ("0" + dateRangeEnd.day).slice(-2);
  }
}

