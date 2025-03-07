// Version: 4.0.0
// Latest Source: https://github.com/Czarto/Adwords-Scripts/blob/master/min-roas-bidding.js
//
// This Google Ads Script will optimize bids based on Return on Ad Spend (ROAS)
// by adjusting bids up or down based on conversion performance across different time periods.

/***********

MIT License

Copyright (c) 2016-2024 Alex Czartoryski

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
    // Conversion settings
    AVG_CONV_VALUE: 40.0,        // Average conversion value
    USE_ACTUAL_CONV_VALUE: true, // Whether to use actual conversion values or average

    // Performance targets
    MIN_ROAS: 4.0,              // Minimum Return on Ad Spend
    MIN_CONVERSIONS: 5,          // Minimum conversions required for bid increase

    // Bid adjustment limits
    MAX_BID_INCREASE: 0.10,      // Maximum bid increase per adjustment
    MIN_BID: 0.05,               // Minimum CPC bid
    HIGH_COST_THRESHOLD: 40.0,   // Cost threshold before lowering bids

    // Bidding strategy
    AGGRESSIVE_BIDDING: false,   // Only lower bids if CPA exceeds MAX_COS

    // Labels
    LABEL_PROCESSING: 'Processing',
    TAG_IGNORE: 'Ignore',
    TAG_INCLUDE: '',

    // Campaign filters
    CAMPAIGN_INCLUDE: '',        // Include campaigns with this text
    CAMPAIGN_EXCLUDE: '',        // Exclude campaigns with this text

    // Date ranges to process
    DATE_RANGES: [
        { name: '7 Days', range: 'LAST_7_DAYS' },
        { name: '14 Days', range: 'LAST_14_DAYS' },
        { name: '30 Days', range: 'LAST_30_DAYS' },
        { name: '90 Days', range: 'LAST_90_DAYS' },
        { name: '1 Year', range: 'LAST_YEAR' }
    ]
};

// Calculate MAX_COS after CONFIG is defined
CONFIG.MAX_COS = 1 / CONFIG.MIN_ROAS;  // Maximum Cost of Sales (1/MIN_ROAS)

function main() {
    try {
        initLabels();
        
        CONFIG.DATE_RANGES.forEach(({ name, range }) => {
            Logger.log(`\n***** ${name} *****`);
            const dateRange = range === 'LAST_90_DAYS' || range === 'LAST_YEAR' 
                ? { start: getDateRange(range), end: TODAY() }
                : { range };

            setAdGroupsToMax(dateRange);
            decreaseHighCostAdGroups(dateRange);
        });

        cleanupLabels();
    } catch (error) {
        Logger.log(`Error in main: ${error.message}`);
        throw error;
    }
}

/**
 * Initialize processing labels
 */
function initLabels() {
    checkLabelExists();

    [AdsApp.adGroups(), AdsApp.shoppingAdGroups()].forEach(selector => {
        const iterator = getSelector(selector).get();
        
        while (iterator.hasNext()) {
            iterator.next().applyLabel(CONFIG.LABEL_PROCESSING);
        }
    });
}

/**
 * Check and create required labels if they don't exist
 */
function checkLabelExists() {
    [CONFIG.LABEL_PROCESSING, CONFIG.TAG_IGNORE].forEach(labelName => {
        if (!AdsApp.labels().withCondition(`Name = '${labelName}'`).get().hasNext()) {
            AdsApp.createLabel(labelName, "AdWords Scripts label used for bid optimization");
        }
    });
}

/**
 * Clean up processing labels
 */
function cleanupLabels() {
    [AdsApp.adGroups(), AdsApp.shoppingAdGroups()].forEach(selector => {
        const iterator = selector
            .withCondition(`LabelNames CONTAINS_ANY ['${CONFIG.LABEL_PROCESSING}']`)
            .get();
            
        while (iterator.hasNext()) {
            iterator.next().removeLabel(CONFIG.LABEL_PROCESSING);
        }
    });
}

/**
 * Increase AdGroup bids based on conversion performance
 */
function setAdGroupsToMax(dateRange) {
    Logger.log('Increasing bids for performing ad groups');

    [AdsApp.adGroups(), AdsApp.shoppingAdGroups()].forEach(selector => {
        const iterator = getSelector(selector)
            .forDateRange(dateRange.range || dateRange.start, dateRange.end)
            .withCondition(`Conversions > ${CONFIG.MIN_CONVERSIONS - 1}`)
            .withCondition(`LabelNames CONTAINS_ANY ['${CONFIG.LABEL_PROCESSING}']`)
            .withCondition("Clicks > 0")
            .get();

        Logger.log(`Found ${iterator.totalNumEntities()} ad groups to process`);

        while (iterator.hasNext()) {
            let adGroup = iterator.next();
            let stats = adGroup.getStatsFor(dateRange.range || dateRange.start, dateRange.end);
            let cost = stats.getCost();
            let clicks = stats.getClicks();
            let currentCpc = adGroup.bidding().getCpc();
            let conversionValue = getAdGroupConversionValue(adGroup, dateRange);
            let costOfSales = cost / conversionValue;
            let maxCpc = getMaxCpcBid(currentCpc, conversionValue, clicks);

            // Apply aggressive bidding logic if enabled
            let finalCpc = CONFIG.AGGRESSIVE_BIDDING && costOfSales < CONFIG.MAX_COS
                ? Math.max(maxCpc, currentCpc)
                : maxCpc;

            adGroup.bidding().setCpc(finalCpc);
            adGroup.removeLabel(CONFIG.LABEL_PROCESSING);
        }
    });
}

/**
 * Decrease bids for high-cost AdGroups
 */
function decreaseHighCostAdGroups(dateRange) {
    Logger.log('\nProcessing high cost ad groups');

    [AdsApp.adGroups(), AdsApp.shoppingAdGroups()].forEach(selector => {
        const iterator = getSelector(selector)
            .forDateRange(dateRange.range || dateRange.start, dateRange.end)
            .withCondition(`Conversions < ${CONFIG.MIN_CONVERSIONS}`)
            .withCondition(`LabelNames CONTAINS_ANY ['${CONFIG.LABEL_PROCESSING}']`)
            .withCondition("Clicks > 0")
            .withCondition(`Cost > ${CONFIG.HIGH_COST_THRESHOLD}`)
            .get();

        Logger.log(`Found ${iterator.totalNumEntities()} high cost ad groups`);

        while (iterator.hasNext()) {
            let adGroup = iterator.next();
            let stats = adGroup.getStatsFor(dateRange.range || dateRange.start, dateRange.end);
            let clicks = stats.getClicks();
            let currentCpc = adGroup.bidding().getCpc();
            let conversionValue = getAdGroupConversionValue(adGroup, dateRange) + CONFIG.AVG_CONV_VALUE;
            let maxCpc = getMaxCpcBid(currentCpc, conversionValue, clicks);

            if (maxCpc < currentCpc) {
                adGroup.bidding().setCpc(maxCpc);
            }
        }
    });
}

/**
 * Get conversion value for an ad group
 */
function getAdGroupConversionValue(adGroup, dateRange) {
    const reportName = adGroup.getEntityType === "ShoppingAdGroup" 
        ? "SHOPPING_PERFORMANCE_REPORT" 
        : "ADGROUP_PERFORMANCE_REPORT";

    const report = AdsApp.report(
        "SELECT ConversionValue, Conversions " +
        `FROM ${reportName} ` +
        `WHERE AdGroupId = ${adGroup.getId()} ` +
        `DURING ${formatDateRange(dateRange)}`
    );

    let row = report.rows().next();
    if (!row) return 0;

    let conversions = parseFloat(row.Conversions);
    let conversionValue = parseFloat(row.ConversionValue.replace(',', ''));

    return CONFIG.USE_ACTUAL_CONV_VALUE ? conversionValue : conversions * CONFIG.AVG_CONV_VALUE;
}

/**
 * Get filtered selector based on campaign and label filters
 */
function getSelector(selector) {
    let filtered = selector
        .withCondition("Status = ENABLED")
        .withCondition("CampaignStatus = ENABLED")
        .withCondition("AdGroupStatus = ENABLED");

    if (CONFIG.TAG_INCLUDE) {
        filtered = filtered.withCondition(`LabelNames CONTAINS_ALL ['${CONFIG.TAG_INCLUDE}']`);
    }

    if (CONFIG.TAG_IGNORE) {
        filtered = filtered.withCondition(`LabelNames CONTAINS_NONE ['${CONFIG.TAG_IGNORE}']`);
    }

    if (CONFIG.CAMPAIGN_INCLUDE) {
        filtered = filtered.withCondition(`CampaignName CONTAINS_IGNORE_CASE '${CONFIG.CAMPAIGN_INCLUDE}'`);
    }

    if (CONFIG.CAMPAIGN_EXCLUDE) {
        filtered = filtered.withCondition(`CampaignName DOES_NOT_CONTAIN_IGNORE_CASE '${CONFIG.CAMPAIGN_EXCLUDE}'`);
    }

    return filtered;
}

/**
 * Calculate maximum CPC bid based on performance
 */
function getMaxCpcBid(currentCpc, conversionValue, clicks) {
    const maxBidIncreaseLimit = currentCpc + CONFIG.MAX_BID_INCREASE;
    const profitMarginLimit = (conversionValue / clicks) * CONFIG.MAX_COS;
    const maxCpcBid = Math.min(maxBidIncreaseLimit, profitMarginLimit);
    return Math.max(maxCpcBid, CONFIG.MIN_BID, 0.01);
}

/**
 * Get date range object
 */
function getDateRange(range) {
    const date = new Date();
    switch (range) {
        case 'LAST_90_DAYS':
            date.setDate(date.getDate() - 90);
            break;
        case 'LAST_YEAR':
            date.setFullYear(date.getFullYear() - 1);
            break;
        default:
            throw new Error(`Unsupported date range: ${range}`);
    }
    return {
        year: date.getFullYear(),
        month: date.getMonth() + 1,
        day: date.getDate()
    };
}

/**
 * Format date range for reporting
 */
function formatDateRange(dateRange) {
    if (dateRange.range) {
        return dateRange.range;
    }

    const formatDate = date => 
        `${date.year}${String(date.month).padStart(2, '0')}${String(date.day).padStart(2, '0')}`;

    return dateRange.start === 'ALL_TIME'
        ? `20000101,${formatDate(TODAY())}`
        : `${formatDate(dateRange.start)},${formatDate(dateRange.end)}`;
}

/**
 * Get today's date
 */
function TODAY() {
    const date = new Date();
    return {
        year: date.getFullYear(),
        month: date.getMonth() + 1,
        day: date.getDate()
    };
}

