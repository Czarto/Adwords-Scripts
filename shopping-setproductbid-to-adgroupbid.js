// Version: 1.0.2

/***********

MIT License

Copyright (c) 2018 Alex Czartoryski
https://business.czarto.com

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

// CAMPAIGN FILTERS
var CAMPAIGN_INCLUDE = ''; // Only include Adgroups and keywords in Campaigns with this text string in the name
var CAMPAIGN_EXCLUDE = ''; // Exclude Adgroups and keywords in Campaigns with this text string in the name

function main() { 
  setProductGroupBidsToAdGroupBids();
}

//
// Set product group bids to adGroup bids.
//
function setProductGroupBidsToAdGroupBids() {

    var adGroupIterator = AdsApp.shoppingAdGroups()
      .withCondition("Status = ENABLED")
      .withCondition("CampaignStatus = ENABLED")
      .withCondition("AdGroupStatus = ENABLED");
    
    if( CAMPAIGN_INCLUDE.length > 0 ) {
        adGroupIterator = adGroupIterator.withCondition("CampaignName CONTAINS_IGNORE_CASE '" + CAMPAIGN_INCLUDE + "'");    
    }

    if( CAMPAIGN_EXCLUDE.length > 0 ) {
        adGroupIterator = adGroupIterator.withCondition("CampaignName DOES_NOT_CONTAIN_IGNORE_CASE '" + CAMPAIGN_EXCLUDE + "'");
    }
    
    adGroupIterator = adGroupIterator.get();

    Logger.log('Total adGroups found : ' + adGroupIterator.totalNumEntities());

    while (adGroupIterator.hasNext()) {
      var adGroup = adGroupIterator.next();
      var current_cpc = adGroup.bidding().getCpc();

      //Logger.log(adGroup.getCampaign().getName() + ":" + adGroup.getName() + ' CPC:' + current_cpc);
      
      var productGroupIterator = adGroup.productGroups().get()
      while (productGroupIterator.hasNext()) {
        var productGroup = productGroupIterator.next();
        
        setProductGroupBid(productGroup, current_cpc);
      }
    }
}

//
// Recursively set bids to product group and children
//
function setProductGroupBid(productGroup, bid) {

    //Logger.log(productGroup.getValue() + " Current Bid:" + productGroup.getMaxCpc() + " New Bid:" + bid );
    
    if( productGroup.isExcluded() ) {
        // Do nothing. Product Group has no bid.
    } else {
        var children = productGroup.children().get();
        if( children.hasNext()) {
            while (children.hasNext()) {
                setProductGroupBid(children.next(), bid);
            }
        } else {
            productGroup.setMaxCpc(bid);
        }
    }   
}
