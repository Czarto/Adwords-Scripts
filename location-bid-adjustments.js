// Version: 4.0.0
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

// Configuration
const CONFIG = {
    // Labels
    LABEL_PROCESSING: '_processing_location',
    LABEL_IGNORE: '',

    // Bid adjustment settings
    BID_INCREMENT: 0.05,          // Value by which to adjust bids
    MIN_CONVERSIONS: 25,          // Minimum conversions needed to adjust bids
    HIGH_COST: 500,               // Adjust bids if cost is above this value
    MAX_BID_ADJUSTMENT: 2.00,     // Maximum bid adjustment multiplier
    MIN_BID_ADJUSTMENT: 0.10,     // Minimum bid adjustment multiplier

    // TODO: Instead of "high cost" use a "high CPA". If Conversions < Min Conversions, but CPA is high, then adjust. Otherwise leave alone.

    // Date ranges to process
    DATE_RANGES: [
        { name: '30 Days', range: 'LAST_30_DAYS' },
        { name: '90 Days', range: 'LAST_90_DAYS' },
        { name: 'Past Year', range: 'LAST_YEAR' }
    ]
};

function main() {
    try {
        initLabels();

        CONFIG.DATE_RANGES.forEach(({ name, range }) => {
            Logger.log(`\nSet Location Bids: ${name}`);
            setLocationBids(range);
        });

        cleanup();
    } catch (error) {
        Logger.log(`Error in main: ${error.message}`);
        throw error;
    }
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
    [AdsApp.campaigns(), AdsApp.shoppingCampaigns()].forEach(selector => {
        const iterator = selector
            .withCondition("Status = ENABLED")
            .get();

        while (iterator.hasNext()) {
            iterator.next().applyLabel(CONFIG.LABEL_PROCESSING);
        }
    });
}

//
// Create the processing label if it does not exist
//
function checkLabelExists() {
    if (!AdsApp.labels()
        .withCondition(`Name = '${CONFIG.LABEL_PROCESSING}'`)
        .get().hasNext()) {
        AdsApp.createLabel(CONFIG.LABEL_PROCESSING, "Google Ads Scripts label used to process bids");
    }
}

//
// Remove Processing label
//
function cleanup() {
    Logger.log('Cleaning up...');
    [AdsApp.campaigns(), AdsApp.shoppingAdGroups()].forEach(selector => {
        const iterator = selector
            .withCondition(`LabelNames CONTAINS_ANY ['${CONFIG.LABEL_PROCESSING}']`)
            .get();

        while (iterator.hasNext()) {
            iterator.next().removeLabel(CONFIG.LABEL_PROCESSING);
        }
    });
}

function setLocationBids(dateRange) {
    const campaignTypes = [
        { selector: AdsApp.campaigns(), name: 'Non-Shopping Campaigns' },
        { selector: AdsApp.shoppingCampaigns(), name: 'Shopping Campaigns' }
    ];

    campaignTypes.forEach(({ selector, name }) => {
        Logger.log('\n### ADJUST LOCATION TARGETING BIDS ###');
        Logger.log(name);
        
        const campaignIterator = getCampaignSelector(selector, dateRange).get();
        Logger.log(`Total Campaigns found: ${campaignIterator.totalNumEntities()}`);
        
        setLocationBidsForCampaigns(campaignIterator, dateRange);
    });
}

//
// Sets the location bids for all the campaigns within the CampaignIterator.
//
function setLocationBidsForCampaigns(campaignIterator, dateRange) {
    while (campaignIterator.hasNext()) {
        let campaign = campaignIterator.next();
        let campaignId = campaign.getId();

        try {
            Logger.log(`\nProcessing campaign: ${campaign.getName()} (${campaignId})`);

            // Get campaign performance data
            let campaignStats = getCampaignStats(campaignId, dateRange);
            if (!campaignStats) {
                Logger.log('No campaign stats found, skipping...');
                continue;
            }

            const { campaignRevenuePerClick } = campaignStats;
            Logger.log(`Campaign revenue per click: ${campaignRevenuePerClick}`);

            // Process location targets
            let locationReport = AdsApp.report(
                `SELECT Id, Clicks, Conversions, ConversionValue, Cost, BidModifier 
                 FROM CAMPAIGN_LOCATION_TARGET_REPORT 
                 WHERE Id > 0 AND CampaignId = ${campaignId} 
                 ${formatReportDateRange(dateRange)}`
            );

            let rows = locationReport.rows();
            if (!rows.hasNext()) {
                Logger.log('No location targets found for this campaign');
                continue;
            }

            while (rows.hasNext()) {
                processLocationBidAdjustment(campaign, rows.next(), campaignRevenuePerClick);
            }
        } catch (error) {
            Logger.log(`Error processing campaign ${campaignId}: ${error.message}`);
            // Continue processing other campaigns
        }
    }
}

function getCampaignStats(campaignId, dateRange) {
    const report = AdsApp.report(
        `SELECT CampaignId, CampaignName, Clicks, ConversionValue 
         FROM CAMPAIGN_PERFORMANCE_REPORT 
         WHERE CampaignId = ${campaignId} 
         AND CampaignStatus = 'ENABLED' 
         ${formatReportDateRange(dateRange)}`
    );

    const row = report.rows().next();
    if (!row) return null;

    const clicks = parseInt(row['Clicks'], 10);
    const revenue = parseFloat(row['ConversionValue'].replace(',', ''));
    
    return {
        campaignName: row['CampaignName'],
        campaignRevenuePerClick: clicks === 0 ? 0 : revenue / clicks
    };
}

function processLocationBidAdjustment(campaign, row, campaignRevenuePerClick) {
    try {
        let locationId = [[campaign.getId(), row["Id"]]];
        let clicks = parseInt(row['Clicks'], 10);
        let conversions = parseInt(row['Conversions'], 10);
        let revenue = parseFloat(row['ConversionValue'].replace(',', ''));
        let cost = parseFloat(row['Cost'].replace(',', ''));
        let currentBidModifier = (parseFloat(row['BidModifier']) / 100.0) + 1;
        let locationRevenuePerClick = clicks === 0 ? 0 : revenue / clicks;

        Logger.log(`Processing location ${row["Id"]} for campaign ${campaign.getName()}`);
        Logger.log(`Current metrics - Clicks: ${clicks}, Conversions: ${conversions}, Cost: ${cost}`);

        if (conversions >= CONFIG.MIN_CONVERSIONS || cost >= CONFIG.HIGH_COST) {
            let targetBidModifier = locationRevenuePerClick / campaignRevenuePerClick;
            let isIncreaseNeeded = targetBidModifier > currentBidModifier && currentBidModifier < CONFIG.MAX_BID_ADJUSTMENT;
            let isDecreaseNeeded = targetBidModifier < currentBidModifier && currentBidModifier > CONFIG.MIN_BID_ADJUSTMENT;

            if (isIncreaseNeeded || isDecreaseNeeded) {
                let success = updateLocationBidModifier(campaign, locationId, currentBidModifier, isIncreaseNeeded);
                if (success) {
                    Logger.log(`Successfully updated bid modifier for location ${row["Id"]}`);
                }
            } else {
                Logger.log(`No bid adjustment needed for location ${row["Id"]}`);
            }
        } else {
            Logger.log(`Location ${row["Id"]} does not meet minimum thresholds`);
        }
    } catch (error) {
        Logger.log(`Error processing location bid adjustment: ${error.message}`);
        // Continue processing other locations
    }
}

function updateLocationBidModifier(campaign, locationId, currentBidModifier, isIncrease) {
    try {
        let locationIterator = campaign.targeting().targetedLocations().withIds(locationId).get();
        
        if (!locationIterator.hasNext()) {
            Logger.log(`Location not found for campaign ${campaign.getName()}, locationId: ${locationId}`);
            return false;
        }

        let location = locationIterator.next();
        let newBidModifier = isIncrease
            ? Math.min(currentBidModifier + CONFIG.BID_INCREMENT, CONFIG.MAX_BID_ADJUSTMENT)
            : Math.max(currentBidModifier - CONFIG.BID_INCREMENT, CONFIG.MIN_BID_ADJUSTMENT);

        Logger.log(`Updating bid modifier from ${currentBidModifier} to ${newBidModifier}`);
        location.setBidModifier(newBidModifier);
        return true;
    } catch (error) {
        Logger.log(`Error updating location bid modifier: ${error.message}`);
        return false;
    }
}

//
// Returns the CampaignIterator object
//
function getCampaignSelector(selector, dateRange) {
    let campaignSelector = selector
        .withCondition("Status = ENABLED")
        .withCondition(`LabelNames CONTAINS_ANY ['${CONFIG.LABEL_PROCESSING}']`);

    if (CONFIG.LABEL_IGNORE) {
        campaignSelector = campaignSelector
            .withCondition(`LabelNames CONTAINS_NONE ['${CONFIG.LABEL_IGNORE}']`);
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

// Add this helper function to format date ranges for reports
function formatReportDateRange(dateRange) {
    switch (dateRange) {
        case 'LAST_30_DAYS':
            return 'DURING LAST_30_DAYS';
        case 'LAST_90_DAYS': {
            const endDate = new Date();
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - 90);
            return `DURING ${formatDate(startDate)},${formatDate(endDate)}`;
        }
        case 'LAST_YEAR': {
            const endDate = new Date();
            const startDate = new Date();
            startDate.setFullYear(startDate.getFullYear() - 1);
            return `DURING ${formatDate(startDate)},${formatDate(endDate)}`;
        }
        default:
            throw new Error(`Unsupported date range: ${dateRange}`);
    }
}

// Helper function to format dates as YYYYMMDD
function formatDate(date) {
    return date.getFullYear() +
        String(date.getMonth() + 1).padStart(2, '0') +
        String(date.getDate()).padStart(2, '0');
}