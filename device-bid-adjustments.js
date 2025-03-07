// Version: 4.0.0
// Latest Source: https://github.com/Czarto/Adwords-Scripts/blob/master/device-bid-adjustments.js
//
// This Google Ads Script will incrementally change device bid adjustments
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
    LABEL_PROCESSING: '_processing_devicebids',
    
    // Bid adjustment settings
    BID_INCREMENT: 0.05,          // Value by which to adjust bids
    MIN_CONVERSIONS: 5,           // Minimum conversions needed to adjust bids
    MAX_BID_ADJUSTMENT: 1.90,     // Maximum bid adjustment multiplier
    MIN_BID_ADJUSTMENT: 0.10,     // Minimum bid adjustment multiplier

    // Date ranges to process
    DATE_RANGES: [
        //{ name: '7 Days', range: 'LAST_7_DAYS' },
        //{ name: '14 Days', range: 'LAST_14_DAYS' },
        //{ name: '30 Days', range: 'LAST_30_DAYS' },
        //{ name: '90 Days', type: 'custom', days: 90 },
        { name: '1 Year', type: 'custom', days: 365 },
        { name: 'All Time', range: 'ALL_TIME' }
    ]
};

let LABEL_RESOURCE_NAME = ''; // Will store the label's resource name

function main() {
    try {
        const label = initializeProcessing();
        LABEL_RESOURCE_NAME = label.getResourceName(); // Store the resource name
        
        CONFIG.DATE_RANGES.forEach(dateRange => {
            const { start, end } = getDateRange(dateRange);
            setDeviceBidModifier(start, end);
        });

        cleanupLabels(LABEL_RESOURCE_NAME);
    } catch (error) {
        Logger.log(`Error in main: ${error.message}`);
        throw error;
    }
}

function initializeProcessing() {
    Logger.log('\nInitializing processing...');
    const label = getOrCreateLabel();
    applyLabelToCampaigns(label);
    return label;
}

function getOrCreateLabel() {
    const label = getLabelByName(CONFIG.LABEL_PROCESSING);
    if (!label) {
        AdsApp.createLabel(CONFIG.LABEL_PROCESSING);
        return getLabelByName(CONFIG.LABEL_PROCESSING);
    }
    return label;
}

function getLabelByName(name) {
    const labelIterator = AdsApp.labels()
        .withCondition(`label.name = "${name}"`)
        .get();

    if (labelIterator.hasNext()) {
        const label = labelIterator.next();
        Logger.log(`Found Label: ${label.getName()}`);
        return label;
    }
    return null;
}

function applyLabelToCampaigns(label) {
    [AdsApp.campaigns(), AdsApp.shoppingCampaigns()].forEach((selector, index) => {
        const iterator = selector.withCondition("campaign.status = ENABLED").get();
        Logger.log(`${index === 0 ? 'Search' : 'Shopping'} Campaigns found: ${iterator.totalNumEntities()}`);
        
        while (iterator.hasNext()) {
            iterator.next().applyLabel(CONFIG.LABEL_PROCESSING);
        }
    });
}

function cleanupLabels(labelResource) {
    Logger.log('\nCleaning up labels...');
    [AdsApp.campaigns(), AdsApp.shoppingCampaigns()].forEach(selector => {
        const iterator = selector
            .withCondition("campaign.status = ENABLED")
            .withCondition(`campaign.labels CONTAINS ANY ('${labelResource}')`)
            .get();

        while (iterator.hasNext()) {
            iterator.next().removeLabel(CONFIG.LABEL_PROCESSING);
        }
    });
}

function setDeviceBidModifier(dateRange, dateRangeEnd) {
    Logger.log(`\nSetting device bids for date range: ${dateRange} to ${dateRangeEnd}`);

    const query = buildCampaignQuery(dateRange, dateRangeEnd);
    const campaignReport = AdsApp.search(query);
    Logger.log(`Total campaigns found: ${campaignReport.totalNumEntities()}`);

    while (campaignReport.hasNext()) {
        let campaignData = campaignReport.next();
        processCampaign(campaignData, dateRange, dateRangeEnd);
    }
}

function buildCampaignQuery(dateRange, dateRangeEnd) {
    return `SELECT 
        campaign.id, 
        metrics.conversions_value, 
        metrics.clicks 
    FROM campaign 
    WHERE campaign.status = 'ENABLED' 
        AND metrics.conversions > ${CONFIG.MIN_CONVERSIONS - 1} 
        AND campaign.labels CONTAINS ANY ('${LABEL_RESOURCE_NAME}') 
        AND segments.date ${formatDateQuery(dateRange, dateRangeEnd)}`;
}

function processCampaign(campaignData, dateRange, dateRangeEnd) {
    const campaignId = campaignData.campaign.id;
    const campaignClicks = campaignData.metrics.clicks;
    const campaignRevenue = campaignData.metrics.conversionsValue;
    const campaignRevenuePerClick = campaignClicks === 0 ? 0 : campaignRevenue / campaignClicks;

    const campaign = getCampaignById(campaignId);
    if (!campaign || campaignRevenuePerClick <= 0) return;

    processDevices(campaign, campaignId, campaignRevenuePerClick, dateRange, dateRangeEnd);
    campaign.removeLabel(CONFIG.LABEL_PROCESSING);
}

function processDevices(campaign, campaignId, campaignRevenuePerClick, dateRange, dateRangeEnd) {
    const deviceQuery = buildDeviceQuery(campaignId, dateRange, dateRangeEnd);
    const deviceReport = AdsApp.search(deviceQuery);

    while (deviceReport.hasNext()) {
        let deviceData = deviceReport.next();
        adjustDeviceBid(campaign, deviceData, campaignRevenuePerClick);
    }
}

function buildDeviceQuery(campaignId, dateRange, dateRangeEnd) {
    return `SELECT 
        segments.device, 
        metrics.clicks, 
        metrics.conversions_value 
    FROM campaign 
    WHERE campaign.id = ${campaignId} 
        AND segments.date ${formatDateQuery(dateRange, dateRangeEnd)}`;
}

function adjustDeviceBid(campaign, deviceData, campaignRevenuePerClick) {
    const device = deviceData.segments.device;
    const clicks = deviceData.metrics.clicks;
    const revenue = deviceData.metrics.conversionsValue;
    const deviceRevenuePerClick = clicks === 0 ? 0 : revenue / clicks;

    const deviceTarget = getDeviceTarget(campaign, device);
    if (!deviceTarget) return;

    const target = deviceTarget.get().next();
    if (!target) return;

    updateBidModifier(target, deviceRevenuePerClick, campaignRevenuePerClick);
}

function getDeviceTarget(campaign, device) {
    const targeting = campaign.targeting().platforms();
    switch (device) {
        case 'DESKTOP': return targeting.desktop();
        case 'MOBILE': return targeting.mobile();
        case 'TABLET': return targeting.tablet();
        default: return null;
    }
}

function updateBidModifier(target, deviceRevenuePerClick, campaignRevenuePerClick) {
    const currentBidAdjustment = target.getBidModifier();
    const targetBidAdjustment = deviceRevenuePerClick / campaignRevenuePerClick;

    if (Math.abs(currentBidAdjustment - targetBidAdjustment) >= CONFIG.BID_INCREMENT) {
        const newBidModifier = targetBidAdjustment > currentBidAdjustment
            ? Math.min(currentBidAdjustment + CONFIG.BID_INCREMENT, CONFIG.MAX_BID_ADJUSTMENT)
            : Math.max(currentBidAdjustment - CONFIG.BID_INCREMENT, CONFIG.MIN_BID_ADJUSTMENT);
        
        target.setBidModifier(newBidModifier);
    }
}

//
// Try loading a standard or shopping campaign by Id
function getCampaignById(campaignId) {
    let campaignIterator = AdsApp.campaigns().withIds([campaignId]).get();

    let campaign;
    if (campaignIterator.hasNext()) {
        campaign = campaignIterator.next();
    } else {
        // Try loading shopping campaign
        campaignIterator = AdsApp.shoppingCampaigns().withIds([campaignId]).get();

        if (campaignIterator.hasNext()) {
            campaign = campaignIterator.next();
        } else {
            // Couldn't load standard nor shopping campaign. Error.
            Logger.log("ERROR: UNABLE TO GET CAMPAIGN ID " + campaignId);
            throw new Error("ERROR: UNABLE TO GET CAMPAIGN ID " + campaignId);
        }
    }
    return campaign;
}

//
// Format date as a string
//
function dateTo_yyyy_mm_yy(date) {
    if(!date) { date = new Date(); }

    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2,'0');
    const dd = String(date.getDate()).padStart(2,'0');

    return `${yyyy}-${mm}-${dd}`
}

//
// Date range helper function
// Returns today's date
//
function TODAY() {
    const date = new Date();
    return dateTo_yyyy_mm_yy(date);
}

//
// Date range helper functions
// Returns date 90 days ago
//
function LAST_90_DAYS() {
    var date = new Date(); 
    date.setDate(date.getDate() - 90);
    return dateTo_yyyy_mm_yy(date);
  }

//
// Date range helper functions
// Returns date 1 year ago
//
function LAST_YEAR() {
    var date = new Date(); 
    date.setDate(date.getDate() - 365);
    return dateTo_yyyy_mm_yy(date);
}

//
// Return a properly formated Date contraint for the query
//
function formatDateQuery(dateRangeStart, dateRangeEnd) {
    if (dateRangeStart == "LAST_7_DAYS" || dateRangeStart == "LAST_14_DAYS" || dateRangeStart == "LAST_30_DAYS") {
        return dateRangeStart;
    } else if (dateRangeStart == "ALL_TIME") {
        return " BETWEEN '2000-01-01' AND '" + TODAY() + "' ";
    } else {
        return " BETWEEN '" + dateRangeStart + "' AND '" + dateRangeEnd + "' ";
    }
}

//
// Date range helper function
// Returns date range for a given date range object
//
function getDateRange(dateRange) {
    if (dateRange.type === 'custom') {
        const date = new Date();
        const start = dateTo_yyyy_mm_yy(new Date(date.setDate(date.getDate() - dateRange.days)));
        const end = dateTo_yyyy_mm_yy(date);
        return { start, end };
    } else {
        const start = dateRange.range;
        const end = TODAY();
        return { start, end };
    }
}