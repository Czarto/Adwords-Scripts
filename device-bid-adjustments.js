// Version: 2.4
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

//
// GLOBAL VARIABLES
//

var LABEL_PROCESSING = "_processing_devicebids";
var LABEL_PROCESSING_RESOURCE = "";

var BID_INCREMENT = 0.05;       // Value by which to adjust bids
var MIN_CONVERSIONS = 5;       // Minimum conversions needed to adjust bids.
var MAX_BID_ADJUSTMENT = 1.90;  // Do not increase adjustments above this value
var MIN_BID_ADJUSTMENT = 0.10;  // Do not decrease adjustments below this value


function main() {
    checkLabelExists(); // Create Labels
    initLabels(); // Add Labels to Campaigns

    //setDeviceBidModifier("LAST_7_DAYS");
    //setDeviceBidModifier("LAST_14_DAYS");
    //setDeviceBidModifier("LAST_30_DAYS");
    //setDeviceBidModifier(LAST_90_DAYS(), TODAY());
    setDeviceBidModifier(LAST_YEAR(), TODAY());
    setDeviceBidModifier("ALL_TIME");
  
    cleanupLabels(); // Remove Labels
}


//
// Create the processing label if it does not exist
//
function checkLabelExists() {
    Logger.log("\nfunction:checkLabelExists()");        
    var label = getLabelByName(LABEL_PROCESSING);
    if( !label ) {
        AdsApp.createLabel(LABEL_PROCESSING);
        label = getLabelByName(LABEL_PROCESSING);
    }

    // Get label resource Ids
    if( label ) {
        LABEL_PROCESSING_RESOURCE = label.getResourceName();
        Logger.log(LABEL_PROCESSING_RESOURCE);        
    } else {
        Logger.log("ERROR: UNABLE TO GET LABEL RESOURCE STRING!");
        throw new Error("ERROR: UNABLE TO GET LABEL RESOURCE STRING!");
    }
}


//
// Set the Processing label
// This keeps track of which campaigns have already been processed
// in the case where multiple lookback windows are being used
//
function initLabels() {
    Logger.log("\nfunction:initLabels()");        

    var campaignTypes = [AdsApp.campaigns(), AdsApp.shoppingCampaigns()];

    for (i = 0; i < campaignTypes.length; i++) {
        var iterator = campaignTypes[i].withCondition("campaign.status = ENABLED").get();
        Logger.log("Total campaigns found: " + (i == 0 ? "Search Campaigns" : "Shopping Campaigns") + ":" + iterator.totalNumEntities());

        while (iterator.hasNext()) {
            var campaign = iterator.next();
            campaign.applyLabel(LABEL_PROCESSING);
        }
    }
}



//
// Remove Processing label
//
function cleanupLabels() {
    Logger.log("\nfunction:cleanupLabels()");        

    // Cleanup labels
    var campaignTypes = [AdsApp.campaigns(), AdsApp.shoppingCampaigns()];
    for (i = 0; i < campaignTypes.length; i++) {
        var iterator = campaignTypes[i]
            .withCondition("campaign.status = ENABLED")
            .withCondition("campaign.labels CONTAINS ANY ('" + LABEL_PROCESSING_RESOURCE + "')")
            .get();

        while (iterator.hasNext()) {
            var campaign = iterator.next();
            campaign.removeLabel(LABEL_PROCESSING);
        }
    }
}


//
// Set Device Bids
//
function setDeviceBidModifier(dateRange, dateRangeEnd) {
    Logger.log(`\nfunction:setDeviceBidModifier(${dateRange},${dateRangeEnd})`);

    var reportQueryTypes = ["campaign"];//, "shopping_performance_view"];
    for (i = 0; i < reportQueryTypes.length; i++) {

        let campaignReportQuery = "SELECT " +
            "campaign.id, " +
            "metrics.conversions_value, " +
            "metrics.clicks " +
            "FROM " + reportQueryTypes[i] + " " +
            "WHERE campaign.status = 'ENABLED' " + 
            "AND metrics.conversions > " + (MIN_CONVERSIONS-1) + " " +
            "AND campaign.labels CONTAINS ANY ('" + LABEL_PROCESSING_RESOURCE + "') " +
            "AND segments.date " + formatDateQuery(dateRange, dateRangeEnd)

        Logger.log("\n\nGetting campaigns...")
        Logger.log(campaignReportQuery);
        let campaignReport = AdsApp.search(campaignReportQuery);
        Logger.log("Total campaigns found:" + campaignReport.totalNumEntities());

        while (campaignReport.hasNext()) {
            let campaignData = campaignReport.next();

            let campaignId = campaignData.campaign.id;
            let campaignClicks = campaignData.metrics.clicks;
            let campaignRevenue = campaignData.metrics.conversionsValue;
            let campaignRevenuePerClick = (campaignClicks == 0 ? 0 : campaignRevenue/campaignClicks);
 
            var campaign = getCampaignById(campaignId);

            if( campaignRevenuePerClick > 0 ) {
                // Get click and revenue data for each device
                let deviceReportQuery = "SELECT " +
                    "segments.device, " +
                    "metrics.clicks, " +
                    "metrics.conversions_value " +
                    "FROM " + reportQueryTypes[i] + " " +
                    "WHERE campaign.id = " + campaignId + " " +
                    "AND segments.date " + formatDateQuery(dateRange, dateRangeEnd)
    
                Logger.log("\nGetting stats for each device...")
                Logger.log(deviceReportQuery);
                let deviceReportRows = AdsApp.search(deviceReportQuery);
                Logger.log("Total devices found:" + deviceReportRows.totalNumEntities());

                while(deviceReportRows.hasNext()) {
                    let deviceData = deviceReportRows.next();
                    let device = deviceData.segments.device;
                    let clicks = deviceData.metrics.clicks;
                    let revenue = deviceData.metrics.conversionsValue;
                    let deviceRevenuePerClick = (clicks == 0 ? 0 : revenue/clicks);
                    let deviceTarget;

                    Logger.log(device);
                    switch(device) {
                        case "DESKTOP": deviceTarget = campaign.targeting().platforms().desktop(); break;
                        case "MOBILE": deviceTarget = campaign.targeting().platforms().mobile(); break;
                        case "TABLET": deviceTarget = campaign.targeting().platforms().tablet(); break;
                        default: deviceTarget = null;
                    }

                    if(deviceTarget) {
                        Logger.log("DeviceTarget valid");
                        let deviceIterator = deviceTarget.get();
                        if( deviceIterator.hasNext()) { 
                            Logger.log("DeviceIterator has next");
                            let target = deviceIterator.next();
                            let currentBidAdjustment = target.getBidModifier();
                            let targetBidAdjustment = (deviceRevenuePerClick / campaignRevenuePerClick);

                            Logger.log("Current Bid Adjustment = " +currentBidAdjustment + "; Target bid adjustment = " + targetBidAdjustment);

                            if (Math.abs(currentBidAdjustment - targetBidAdjustment) >= BID_INCREMENT) {
                                if (targetBidAdjustment > currentBidAdjustment) {
                                    // Increase
                                    target.setBidModifier(Math.min(currentBidAdjustment + BID_INCREMENT, MAX_BID_ADJUSTMENT));
                                } else {
                                    // Decrease
                                    target.setBidModifier(Math.max(currentBidAdjustment - BID_INCREMENT, MIN_BID_ADJUSTMENT));
                                }
                            }
                        }
                    }
                }
            }

            campaign.removeLabel(LABEL_PROCESSING);
        }
    }
}

//
// Try loading a standard or shopping campaign by Id
function getCampaignById(campaignId) {
    let campaignIterator = AdsApp.campaigns().withIds([campaignId]).get();

    var campaign;
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
// Get label by name
//
function getLabelByName(name) {
    const labelIterator = AdsApp.labels()
        .withCondition(`label.name = "${name}"`)
        .get();

    if (labelIterator.hasNext()) {
        const label = labelIterator.next();
        console.log(`Found Label: ${label.getName()}`);
        return label;
    }

    console.log(`Label not found: ${name}`);
    return null;
}