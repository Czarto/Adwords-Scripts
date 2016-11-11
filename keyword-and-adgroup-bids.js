// Version: Beta

var CONVERSION_VALUE = 50.0;
var TAG_IGNORE = 'Script Ignore';
var CAMPAIGN_INCLUDE = ''; // Only include Adgroups and keywords in Campaigns with this text string in the name

var BID_INCREMENT = 0.25;

var THRESHOLD_INCREASE = 10;    // Set this to 1 to increase bids more aggressively
var THRESHOLD_DECREASE = 1;    // Set this to 1 to decrease bids more aggressively
var THRESHOLD_SIGNIFICANT = 20; // Extra bid adjustment happens when this many conversions

var HIGH_COST = 100;    // How much is too much

var STOPLIMIT_POSITION = 1.3; // Do not increase bids at this position or better



function main() { 
  ////setAdGroupBids("ALL_TIME");
  
  Logger.log('\n***** 1 YEAR *****');  
  setAdGroupBids(LAST_YEAR(), TODAY());
  setAdGroupBids_highCost(LAST_YEAR(), TODAY());
  setKeywordBids(LAST_YEAR(), TODAY());
  setKeywordBids_highCost(LAST_YEAR(), TODAY());
  
  Logger.log('\n***** 30 DAYS *****');  
  setAdGroupBids("LAST_30_DAYS");
  setAdGroupBids_highCost("LAST_30_DAYS");
  setKeywordBids("LAST_30_DAYS");
  setKeywordBids_highCost("LAST_30_DAYS");

  Logger.log('\n***** 14 DAYS *****');  
  setAdGroupBids("LAST_14_DAYS");
  setAdGroupBids_highCost("LAST_14_DAYS");
  setKeywordBids("LAST_14_DAYS");  
  setKeywordBids_highCost("LAST_14_DAYS");

  Logger.log('\n***** 7 DAYS *****');
  setAdGroupBids("LAST_7_DAYS");
  setAdGroupBids_highCost("LAST_7_DAYS");
  setKeywordBids("LAST_7_DAYS");
  setKeywordBids_highCost("LAST_7_DAYS");
}



// ******************************************************************
// SET ADGROUP BIDS
// ******************************************************************
function setAdGroupBids(dateRange, dateRangeEnd) {
   Logger.log('\nSet Ad Group Bids, > ' + THRESHOLD_SIGNIFICANT + ' Conv : ' + dateRange);
   var adGroupIterator = getSelector(AdWordsApp.adGroups(), dateRange, dateRangeEnd)
      .withCondition("ConvertedClicks > " + THRESHOLD_SIGNIFICANT)
      .get();
  
  Logger.log('Total adGroups found : ' + adGroupIterator.totalNumEntities());
  
  while (adGroupIterator.hasNext()) {
    var adGroup = adGroupIterator.next();
    var stats = adGroup.getStatsFor(dateRange, dateRangeEnd);
    var conv_rate = stats.getClickConversionRate();
    var current_cpc = adGroup.bidding().getCpc();
    var max_cpc = roundDown(conv_rate * CONVERSION_VALUE);
    
    var new_cpc = max_cpc;
    if( max_cpc > current_cpc) { // Increase bids
       new_cpc = Math.min(current_cpc + BID_INCREMENT, max_cpc);
    } else if (max_cpc < current_cpc) { // Decrease bids
       new_cpc = Math.max(current_cpc - BID_INCREMENT, max_cpc);
    }

    //Logger.log('AdGroup Name: ' + adGroup.getName() + ' ConvRate:' + conv_rate + ' MaxCPC:' + max_cpc);   
    adGroup.bidding().setCpc(new_cpc);
  } 
}

// ******************************************************************
// SET ADGROUP BIDS FOR HIGH COST ADWORDS
// ******************************************************************
function setAdGroupBids_highCost(dateRange, dateRangeEnd) {
   Logger.log('\nHigh Cost AdGroups : ' + dateRange);
    var highCostThreshold = (CONVERSION_VALUE * .80);

   var adGroupIterator = getSelector(AdWordsApp.adGroups(), dateRange, dateRangeEnd)
     .withCondition("ConvertedClicks <= " + THRESHOLD_SIGNIFICANT)
     .get();

  
  Logger.log('Total adGroups found : ' + adGroupIterator.totalNumEntities());
  
  while (adGroupIterator.hasNext()) {
    var adGroup = adGroupIterator.next();
    var stats = adGroup.getStatsFor(dateRange, dateRangeEnd);
    var conversions = stats.getConvertedClicks();
    var clicks = stats.getClicks();
    var cost = stats.getCost();
    var conv_rate = stats.getClickConversionRate();

    if( conversions == 0 && clicks > 0) {
      conversions = 1;
      conv_rate = conversions / clicks;
    }
    
    var cpa = cost / conversions;

    if (cpa > highCostThreshold) {
      var max_cpc = roundDown(conv_rate * CONVERSION_VALUE);
      
      if( max_cpc < adGroup.bidding().getCpc()) {
        adGroup.bidding().setCpc(max_cpc);
      }
    }
  } 
}



// ******************************************************************
// SET KEYWORD BIDS
// ******************************************************************
function setKeywordBids(dateRange, dateRangeEnd) {
  Logger.log('\nSet Keyword Bids : ' + dateRange);
  
  var KeywordIterator = getSelector(dateRange, dateRangeEnd)
      .withCondition("ConvertedClicks > " + THRESHOLD_SIGNIFICANT)
      .get();
  
  Logger.log('Total Keywords found : ' + KeywordIterator.totalNumEntities());
  
  while (KeywordIterator.hasNext()) {
    var keyword = KeywordIterator.next();
    var stats = keyword.getStatsFor(dateRange, dateRangeEnd);
    var conv_rate = stats.getClickConversionRate();
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
       new_cpc = Math.min(current_cpc + BID_INCREMENT, max_cpc);
    } else if (max_cpc < current_cpc) { // Decrease bids
       new_cpc = Math.max(current_cpc - BID_INCREMENT, max_cpc);
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


// ******************************************************************
// SET KEYWORD BIDS, HIGH COST
// ******************************************************************
function setKeywordBids_highCost(dateRange, dateRangeEnd) {
  Logger.log('\nSet Keyword Bids, High Cost : ' + dateRange); 
  
  var KeywordIterator = getSelector(AdWordsApp.keywords(), dateRange, dateRangeEnd)
     .withCondition("ConvertedClicks <= " + THRESHOLD_SIGNIFICANT)
     .get();
  
  Logger.log('Total Keywords found : ' + KeywordIterator.totalNumEntities());
  
  var highCostThreshold = (CONVERSION_VALUE * .80);  
  
  while (KeywordIterator.hasNext()) {
    var keyword = KeywordIterator.next();
    var stats = keyword.getStatsFor(dateRange, dateRangeEnd);
    var conversions = stats.getConvertedClicks();
    var clicks = stats.getClicks();
    var cost = stats.getCost();
    var conv_rate = stats.getClickConversionRate();
    var cpc_firstpage = keyword.getFirstPageCpc();
    var cpc_toppage = keyword.getTopOfPageCpc();
    var cpc_now = keyword.bidding().getCpc();
    var cpc_max = roundDown(conv_rate * CONVERSION_VALUE);  
    var cpa = CONVERSION_VALUE;

    
    if( conversions == 0 && clicks > 0) {
      conv_rate = 1 / clicks;
      cpa = cost;
      cpc_max = roundDown(conv_rate * CONVERSION_VALUE);  
    } else {
      cpa = cost / conversions;
    }  
    
    // If CPA is greater than max cost, reduce bid    
    if (cpa > highCostThreshold) {
      if( cpc_max < cpc_now) {
        keyword.bidding().setCpc(cpc_max);
      }
    } 
    
    // If current CPC is below top of page, increase to top of page if possible
    else if( cpc_now < cpc_toppage && cpc_toppage < cpc_max ) {
      if( conversions >= 1 ) {
        keyword.bidding().setCpc(cpc_toppage);
        Logger.log('------ ' + keyword.getText() + ' increased to top of page;');
      }
    }
    
    // If current CPC is below first page, increase to first page if possible
    else if( cpc_now < cpc_firstpage && cpc_firstpage < cpc_max ) {
      if( conversions >= 1 ) {
        keyword.bidding().setCpc(cpc_firstpage);
        Logger.log('------ ' + keyword.getText() + ' increased to first of page;');
      }
    }
  } 
}




//**************************************************
// Return Keyword or AdGroup Selector
//**************************************************
function getSelector(selector, dateRange, dateRangeEnd) {
 var keywordSelector = selector
      .forDateRange(dateRange, dateRangeEnd)
      .withCondition("Status = ENABLED")
      .withCondition("CampaignStatus = ENABLED")
      .withCondition("AdGroupStatus = ENABLED")
      .withCondition("Clicks > 0");
  
  if( TAG_IGNORE.length > 0 ) {
    keywordSelector = keywordSelector.withCondition("LabelNames CONTAINS_NONE ['" + TAG_IGNORE + "']");
  }
 
  if( CAMPAIGN_INCLUDE.length > 0 ) {
    keywordSelector = keywordSelector.withCondition("CampaignName CONTAINS_IGNORE_CASE '" + CAMPAIGN_INCLUDE + "'");    
  }
  
  return keywordSelector;
}


// Round down bids to the closest quarter dollar.
function roundDown(value) {
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
