// Version: 4.0.0
// Latest Source: https://github.com/Czarto/Adwords-Scripts/blob/master/shopping-setproductbid-to-adgroupbid.js
//
// This Google Ads Script will set product group bids to match their parent ad group's bid.
// Useful for resetting product group bids to their ad group's default bid.

/***********

MIT License

Copyright (c) 2018-2024 Alex Czartoryski
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

// Configuration
const CONFIG = {
    // Campaign filters - leave empty to process all campaigns
    CAMPAIGN_INCLUDE: '', // Only include Adgroups in Campaigns with this text string in the name
    CAMPAIGN_EXCLUDE: '', // Exclude Adgroups in Campaigns with this text string in the name
};

function main() {
    try {
        setProductGroupBidsToAdGroupBids();
    } catch (error) {
        Logger.log(`Error in main: ${error.message}`);
        throw error;
    }
}

/**
 * Sets product group bids to match their parent ad group's bid
 */
function setProductGroupBidsToAdGroupBids() {
    const adGroupIterator = getFilteredAdGroupIterator();
    Logger.log(`Total adGroups found: ${adGroupIterator.totalNumEntities()}`);

    while (adGroupIterator.hasNext()) {
        let adGroup = adGroupIterator.next();
        let currentCpc = adGroup.bidding().getCpc();
        
        processProductGroups(adGroup, currentCpc);
    }
}

/**
 * Gets an iterator of ad groups based on campaign filters
 */
function getFilteredAdGroupIterator() {
    let iterator = AdsApp.shoppingAdGroups()
        .withCondition("Status = ENABLED")
        .withCondition("CampaignStatus = ENABLED")
        .withCondition("AdGroupStatus = ENABLED");
    
    if (CONFIG.CAMPAIGN_INCLUDE) {
        iterator = iterator.withCondition(`CampaignName CONTAINS_IGNORE_CASE '${CONFIG.CAMPAIGN_INCLUDE}'`);
    }

    if (CONFIG.CAMPAIGN_EXCLUDE) {
        iterator = iterator.withCondition(`CampaignName DOES_NOT_CONTAIN_IGNORE_CASE '${CONFIG.CAMPAIGN_EXCLUDE}'`);
    }
    
    return iterator.get();
}

/**
 * Processes all product groups for a given ad group
 */
function processProductGroups(adGroup, bid) {
    const productGroupIterator = adGroup.productGroups().get();
    
    while (productGroupIterator.hasNext()) {
        let productGroup = productGroupIterator.next();
        setProductGroupBid(productGroup, bid);
    }
}

/**
 * Recursively sets bids to product group and its children
 * @param {ProductGroup} productGroup - The product group to process
 * @param {number} bid - The bid to set
 */
function setProductGroupBid(productGroup, bid) {
    if (productGroup.isExcluded()) {
        return; // Skip excluded product groups
    }

    const children = productGroup.children().get();
    
    if (children.hasNext()) {
        // Process all children recursively
        while (children.hasNext()) {
            let child = children.next();
            setProductGroupBid(child, bid);
        }
    } else {
        // Set bid for leaf nodes (product groups without children)
        let currentBid = productGroup.getMaxCpc();
        if (currentBid !== bid) {
            Logger.log(`Setting bid for ${productGroup.getValue()} from ${currentBid} to ${bid}`);
            productGroup.setMaxCpc(bid);
        }
    }
}
