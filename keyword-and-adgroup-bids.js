// Version: V2 Beta

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

var CONVERSION_VALUE = 40.0;
var HIGHCOST_VALUE = CONVERSION_VALUE; // How much is too much

var MAX_BID_INCREASE = 1.0;  // In dollars. Set to 0 for no limit
var THRESHOLD_INCREASE = 10;    // Minimum number of conversions to make a bid increase. Set this to 1 to increase bids most aggressively

var STOPLIMIT_POSITION = 1.2;  // Do not increase bids if the keyword is already at this position or better

// LOGIC FLAGS
var AGGRESSIVE_BIDDING = true;   // Don't lower bids unless the current CPA is over  HIGHCOST_VALUE.
var ROUNDDOWN_BIDS = false; // Bids are rounded down to the nearest quarter dollar

// LABELS
var LABEL_PROCESSING = 'Processing';
var TAG_IGNORE = 'Script Ignore';

// CAMPAIGN FILTERS
var CAMPAIGN_INCLUDE = ''; // Only include Adgroups and keywords in Campaigns with this text string in the name
var CAMPAIGN_EXCLUDE = ''; // Exclude Adgroups and keywords in Campaigns with this text string in the name


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
  setKeywordsToMax("LAST_7_DAYS");
  decreaseHighCostAdGroups("LAST_7_DAYS");
  decreaseHighCostKeywords("LAST_7_DAYS");
  
  Logger.log('\n***** 14 DAYS *****');
  setAdGroupsToMax("LAST_14_DAYS");
  setKeywordsToMax("LAST_14_DAYS");
  decreaseHighCostAdGroups("LAST_14_DAYS");
  decreaseHighCostKeywords("LAST_14_DAYS");

  
  Logger.log('\n***** 30 DAYS *****');
  setAdGroupsToMax("LAST_30_DAYS");
  setKeywordsToMax("LAST_30_DAYS");
  decreaseHighCostAdGroups("LAST_30_DAYS");
  decreaseHighCostKeywords("LAST_30_DAYS");

  
  Logger.log('\n***** 90 DAYS *****');
  setAdGroupsToMax(LAST_90_DAYS(), TODAY());
  setKeywordsToMax(LAST_90_DAYS(), TODAY());
  decreaseHighCostAdGroups(LAST_90_DAYS(), TODAY());
  decreaseHighCostKeywords(LAST_90_DAYS(), TODAY());

  
  Logger.log('\n***** 1 YEAR *****');
  setAdGroupsToMax(LAST_YEAR(), TODAY());
  setKeywordsToMax(LAST_YEAR(), TODAY());
  decreaseHighCostAdGroups(LAST_YEAR(), TODAY());
  decreaseHighCostKeywords(LAST_YEAR(), TODAY());

  cleanup();
}


//
// Set the Processing label
//
function initLabels() {
  checkLabelExists();

  // Flag all AdGroups for processing
  var adGroupIterator = getSelector(AdWordsApp.adGroups()).get();
  while(adGroupIterator.hasNext()){
    var adGroup = adGroupIterator.next();
    adGroup.applyLabel(LABEL_PROCESSING);
  }

  // Flag all Keywords for processing
  var keywordIterator = getSelector(AdWordsApp.keywords()).get();    
  while(keywordIterator.hasNext()){
    var keyword = keywordIterator.next();
    keyword.applyLabel(LABEL_PROCESSING);
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
}


//
// Remove Processing label
//
function cleanup() {
  var adGroupIterator = AdWordsApp.adGroups()
    .withCondition("LabelNames CONTAINS_ANY ['" + LABEL_PROCESSING + "']"). get();

  while(adGroupIterator.hasNext()){
    var adGroup = adGroupIterator.next();
    adGroup.removeLabel(LABEL_PROCESSING);
  }

  var keywordIterator = AdWordsApp.keywords()
    .withCondition("LabelNames CONTAINS_ANY ['" + LABEL_PROCESSING + "']"). get();

  while(keywordIterator.hasNext()){
    var keyword = keywordIterator.next();
    keyword.removeLabel(LABEL_PROCESSING);
  }
}


//
// Increase AdGroup bids to maximum supported by conversion rates
function setAdGroupsToMax(dateRange, dateRangeEnd) {
  Logger.log('increaseAdGroupsToMax');
  
  // Only process keywords that have:
  //  - More conversions than the min threshold
  //  - Are marked for Processing
  //  - Have at least one click
  //  - And who's avg position is worst than the StopLimit
  var adGroupIterator = AdWordsApp.adGroups()
      .forDateRange(dateRange, dateRangeEnd)
      .withCondition("Conversions >= " + THRESHOLD_INCREASE)
      .withCondition("LabelNames CONTAINS_ANY ['" + LABEL_PROCESSING + "']")
      .withCondition("Clicks > 0")
      .withCondition("AveragePosition > " + STOPLIMIT_POSITION)
      .get();
  
  Logger.log('Total adGroups found : ' + adGroupIterator.totalNumEntities());
  
  while (adGroupIterator.hasNext()) {
    var adGroup = adGroupIterator.next();
    var stats = adGroup.getStatsFor(dateRange, dateRangeEnd);
    var conv_rate = stats.getConversionRate();
    var conversions = stats.getConversions();
    var cost = stats.getCost();
    var CPA = cost / conversions;
    var current_cpc = adGroup.bidding().getCpc();
    var max_cpc = roundDown(conv_rate * CONVERSION_VALUE);

    if(MAX_BID_INCREASE > 0) {
      max_cpc = roundDown(Math.min(current_cpc+MAX_BID_INCREASE, max_cpc));
    }
    
    if( AGGRESSIVE_BIDDING ) {
      if( max_cpc > current_cpc || CPA > CONVERSION_VALUE ) {
        adGroup.bidding().setCpc(max_cpc);
      }
    } else {  // Blanced Bidding
      adGroup.bidding().setCpc(max_cpc);
    }
     // Remove processing label even if no changes made, as the keyword
    // is still performing well, so we don't want further back looking
    // functions to reduce the bid
    adGroup.removeLabel(LABEL_PROCESSING);
  } 
}


function setKeywordsToMax(dateRange, dateRangeEnd) {
  Logger.log('increaseKeywordsToMax');
  
  var KeywordIterator = AdWordsApp.keywords()
      .forDateRange(dateRange, dateRangeEnd)
      .withCondition("Conversions >= " + THRESHOLD_INCREASE)
      .withCondition("LabelNames CONTAINS_ANY ['" + LABEL_PROCESSING + "']")
      .withCondition("Clicks > 0")
      .withCondition("AveragePosition > " + STOPLIMIT_POSITION)
      .get();
  
  Logger.log('Total Keywords found : ' + KeywordIterator.totalNumEntities());
  
  while (KeywordIterator.hasNext()) {
    var keyword = KeywordIterator.next();
    var stats = keyword.getStatsFor(dateRange, dateRangeEnd);
    var conversions = stats.getConversions();
    var cost = stats.getCost();
    var CPA = cost / conversions;
    var conv_rate = stats.getConversionRate();
    var max_cpc = roundDown(conv_rate * CONVERSION_VALUE);

    // Temp variables
    var keywordBidding = keyword.bidding();
    var current_cpc = keywordBidding.getCpc();

    if(MAX_BID_INCREASE > 0) {
      max_cpc = roundDown(Math.min(current_cpc+MAX_BID_INCREASE, max_cpc));
    }

    if( AGGRESSIVE_BIDDING ) {
      if( max_cpc > current_cpc || CPA > CONVERSION_VALUE ) {
        keyword.bidding().setCpc(max_cpc);
      }
    } else {  // Blanced Bidding
      keyword.bidding().setCpc(max_cpc);
    }
    
    // Remove processing label even if no changes made, as the keyword
    // is still performing well, so we don't want further back looking
    // functions to reduce the keyword
    keyword.removeLabel(LABEL_PROCESSING);
  } 
}



// 
// Reset high cost AdGroups
// 
function decreaseHighCostAdGroups(dateRange, dateRangeEnd) {
   Logger.log('\nHigh Cost AdGroups : ' + dateRange);

   var adGroupIterator = AdWordsApp.adGroups()
      .forDateRange(dateRange, dateRangeEnd)
     .withCondition("Conversions < " + THRESHOLD_INCREASE)
     .withCondition("LabelNames CONTAINS_ANY ['" + LABEL_PROCESSING + "']")
     .withCondition("Clicks > 0")
     .get();

  
  Logger.log('Total adGroups found : ' + adGroupIterator.totalNumEntities());
  
  while (adGroupIterator.hasNext()) {
    var adGroup = adGroupIterator.next();
    var stats = adGroup.getStatsFor(dateRange, dateRangeEnd);
    var conversions = stats.getConversions();
    var clicks = stats.getClicks();
    var cost = stats.getCost();
    var conv_rate = stats.getConversionRate();

    if( conversions <= 1 && clicks > 0 ) {
      conversions = 1;
      conv_rate = conversions / clicks;
    }
    
    var cpa = cost / conversions;

    if (cpa > HIGHCOST_VALUE && conv_rate > 0) {
      var max_cpc = roundDown(conv_rate * CONVERSION_VALUE);
      adGroup.bidding().setCpc(max_cpc);
      adGroup.removeLabel(LABEL_PROCESSING);
    }
  } 
}



// 
// Reset high cost keywords
// 
function decreaseHighCostKeywords(dateRange, dateRangeEnd) {
  Logger.log('\nSet Keyword Bids, High Cost : ' + dateRange); 
  
  // We only look at 
  var KeywordIterator = AdWordsApp.keywords()
     .forDateRange(dateRange, dateRangeEnd)
     .withCondition("Conversions < " + THRESHOLD_INCREASE)
     .withCondition("LabelNames CONTAINS_ANY ['" + LABEL_PROCESSING + "']")
     .withCondition("Clicks > 0")
     .get();

  
  Logger.log('Total Keywords found : ' + KeywordIterator.totalNumEntities());
  
  while (KeywordIterator.hasNext()) {
    var keyword = KeywordIterator.next();
    var stats = keyword.getStatsFor(dateRange, dateRangeEnd);
    var conversions = stats.getConversions();
    var clicks = stats.getClicks();
    var cost = stats.getCost();
    var conv_rate = stats.getConversionRate();


    if( conversions < 1 && clicks > 0 ) {
      conversions = 1;
      conv_rate = conversions / clicks;
    }
    
    var cpa = cost / conversions;

    if (cpa > HIGHCOST_VALUE && conv_rate > 0) {
      var max_cpc = roundDown(conv_rate * CONVERSION_VALUE);
      keyword.bidding().setCpc(max_cpc);
      keyword.removeLabel(LABEL_PROCESSING);
    }
  } 
}

// ---------

// ******************************************************************
// TODO: When do we set Keywords bids to Adgroup bids
// ******************************************************************
function setKeywordBids(dateRange, dateRangeEnd) {
  Logger.log('\nSet Keyword Bids : ' + dateRange);
  
  var KeywordIterator = getSelector(AdWordsApp.keywords())
      .forDateRange(dateRange, dateRangeEnd)
      .withCondition("Conversions > " + THRESHOLD_INCREASE)
      .withCondition("Clicks > 0")
      .get();
  
  Logger.log('Total Keywords found : ' + KeywordIterator.totalNumEntities());
  
  while (KeywordIterator.hasNext()) {
    var keyword = KeywordIterator.next();
    var stats = keyword.getStatsFor(dateRange, dateRangeEnd);
    var conv_rate = stats.getConversionRate();
    var max_cpc = roundDown(conv_rate * CONVERSION_VALUE);

    // Temp variables
    var keywordBidding = keyword.bidding();
    var current_cpc = keywordBidding.getCpc();
    
    // Calculate Range for wich we want to keep adgroup bids
    var AdGroupCpc = keyword.getAdGroup().bidding().getCpc();
    var AdGroupCpcMin = AdGroupCpc * 0.9;
    var AdGroupCpcMax = AdGroupCpc * 1.1;
    
    var new_cpc = max_cpc;
    if( max_cpc > current_cpc) { // Increase bids
       new_cpc = Math.min(current_cpc + MAX_BID_INCREASE, max_cpc);
    } else if (max_cpc < current_cpc) { // Decrease bids
       new_cpc = Math.max(current_cpc - MAX_BID_INCREASE, max_cpc);
    }
    
    if( new_cpc > current_cpc && stats.getAveragePosition() < STOPLIMIT_POSITION ) {
      Logger.log('Keyword: ' + keyword.getText() + ' Position too high. Bid not updated.');
    } else if( new_cpc > AdGroupCpcMin && new_cpc < AdGroupCpcMax ) {
      keywordBidding.clearCpc();
      Logger.log('Keyword: ' + keyword.getText() + ' Keyword bid reset to AdGroup bid');
    } else {
      Logger.log('Keyword: ' + keyword.getText() + ' ConvRate:' + conv_rate + ' MaxCPC:' + max_cpc);   
      keywordBidding.setCpc(new_cpc);
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
// Round down bids to the closest quarter dollar.
//
function roundDown(value) {
  var newBid = value;

  if( ROUNDDOWN_BIDS ) {
    var suffix = value % 1;
    var prefix = value - suffix;
    
    var newSuffix = suffix;

    if( suffix < 0.25 ) {
      if( prefix > 0 ) newSuffix = 0.0;
    } else if( suffix < 0.50 ) {
      newSuffix = 0.25 ;
    } else if( suffix < 0.75) {
      newSuffix = 0.50;
    } else {
      newSuffix = 0.75;
    }
    
    var newBid = prefix + newSuffix;
    
    //Logger.log('bid: ' + value + '; new bid: ' + newBid);
  }

  return newBid;
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
  var today = TODAY();
  
  today.month = today.month-3;
  return today;
}
