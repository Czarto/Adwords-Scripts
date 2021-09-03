// Version: 2.0
// Latest Source: https://github.com/Czarto/Adwords-Scripts/blob/master/device-bid-adjustments.js
//
// This Google Ads Script will incrementally change device bid adjustments
// based on conversion rates using the Campaign's average conversion rate
// as a baseline.
//

/***********

MIT License

Copyright (c) 2016-2021 Alex Czartoryski

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

var LABEL_PROCESSING_DESKTOP = "_processing_desktop";
var LABEL_PROCESSING_MOBILE = "_processing_mobile";
var LABEL_PROCESSING_TABLET = "_processing_tablet";

var BID_INCREMENT = 0.05;       // Value by which to adjust bids
var MIN_CONVERSIONS = 10;       // Minimum conversions needed to adjust bids.
var MAX_BID_ADJUSTMENT = 1.90;  // Do not increase adjustments above this value



function main() {
    initLabels(); // Create Labels

    /*****
      Device performance *should* theoretically not vary over time
      (unless a site redesign has been performed) and so it makes
      most sense to use a relatively long time period (1 year)
      on which to base adjustments.

      Shorter time periods included for reference, but commented out
    *****/

    //setDeviceBidModifier("LAST_7_DAYS");
    //setDeviceBidModifier("LAST_14_DAYS");
    //setDeviceBidModifier("LAST_30_DAYS");
    //setDeviceBidModifier(LAST_90_DAYS(), TODAY());
    setDeviceBidModifier(LAST_YEAR(), TODAY());
    setDeviceBidModifier("ALL_TIME");

    cleanup(); // Remove Labels

    //TODO: Allow to select campaigns by Campaign Name
    //TODO: Remove 
}


//
// Set the Processing label
// This keeps track of which bid adjustments have already been processed
// in the case where multiple time-lookback windows are being used
//
function initLabels() {
    checkLabelExists();
    cleanup();

    var itemsToLabel = [AdsApp.campaigns(), AdsApp.shoppingCampaigns()];

    for (i = 0; i < itemsToLabel.length; i++) {
        var iterator = itemsToLabel[i].get();

        while (iterator.hasNext()) {
            campaign = iterator.next();
            campaign.applyLabel(LABEL_PROCESSING_DESKTOP);
            campaign.applyLabel(LABEL_PROCESSING_MOBILE);
            campaign.applyLabel(LABEL_PROCESSING_TABLET);
        }
    }
}



//
// Create the processing label if it does not exist
//
function checkLabelExists() {

    var labels = [LABEL_PROCESSING_DESKTOP, LABEL_PROCESSING_MOBILE, LABEL_PROCESSING_TABLET];

    for (i = 0; i < labels.length; i++) {
        var labelIterator = AdsApp.labels().withCondition("Name = '" + labels[i] + "'").get();
        if (!labelIterator.hasNext()) {
            AdsApp.createLabel(labels[i], "AdWords Scripts label used to process device bid adjustments");
        }
    }
}


//
// Remove Processing label
//
function cleanup() {
    var cleanupList = [AdsApp.campaigns(), AdsApp.shoppingCampaigns()];

    for (i = 0; i < cleanupList.length; i++) {
        var iterator = cleanupList[i].get();

        while (iterator.hasNext()) {
            campaign = iterator.next();
            campaign.removeLabel(LABEL_PROCESSING_DESKTOP);
            campaign.removeLabel(LABEL_PROCESSING_MOBILE);
            campaign.removeLabel(LABEL_PROCESSING_TABLET);
        }
    }
}


//
// Set Device Bids
//
function setDeviceBidModifier(dateRange, dateRangeEnd) {

    var STANDARD = 0;
    var SHOPPING = 1;

    //Logger.log('Date Range from ' + dateRange + ' to ' + dateRangeEnd);

    for (i = 0; i < 2; i++) {
        //Logger.log('---  ' + (i==STANDARD ? 'Standard Campaigns' : 'Shopping Campaigns'));

        var labels = [LABEL_PROCESSING_DESKTOP, LABEL_PROCESSING_MOBILE, LABEL_PROCESSING_TABLET];

        for (l = 0; l < labels.length; l++) {
            //Logger.log('     ' + labels[l]);

            var campaigns = (i==STANDARD ? AdsApp.campaigns() : AdsApp.shoppingCampaigns());
            var campaignIterator = campaigns.forDateRange(dateRange, dateRangeEnd)
                .withCondition("campaign.status = ENABLED")
                .withCondition("metrics.conversions > " + MIN_CONVERSIONS)
                .withCondition("campaign.labels CONTAINS ANY ('" + labels[l] + "')")
                .get();

            while (campaignIterator.hasNext()) {
                var campaign = campaignIterator.next();
                var baseConversionRate = campaign.getStatsFor(dateRange, dateRangeEnd).getConversionRate();
                var platforms = [campaign.targeting().platforms().desktop(),
                    campaign.targeting().platforms().mobile(),
                    campaign.targeting().platforms().tablet()
                ];

                //Logger.log('    CAMPAIGN: ' + campaign.getName());

                var targetIterator = platforms[l].get();
                if (targetIterator.hasNext()) {
                    var target = targetIterator.next();
                    var stats = target.getStatsFor(dateRange, dateRangeEnd);
                    var conversions = stats.getConversions();
                    var conversionRate = stats.getConversionRate();
                    var targetModifier = (conversionRate / baseConversionRate);
                    var currentModifier = target.getBidModifier();

                    //Logger.log('    Conversions: ' + conversions);
                    
                    if (conversions >= MIN_CONVERSIONS) {
                        if (Math.abs(currentModifier - targetModifier) >= BID_INCREMENT) {
                            if (targetModifier > currentModifier) {
                                target.setBidModifier(Math.min(currentModifier + BID_INCREMENT, MAX_BID_ADJUSTMENT));
                            } else {
                                target.setBidModifier(Math.max(currentModifier - BID_INCREMENT, 0.1));
                            }
                        }

                        campaign.removeLabel(labels[l]);
                        //Logger.log('    Remove Label: ' + labels[l]);
                    }
                }

            }
        }
    }
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
