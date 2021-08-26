# Google Ads Bidding Scripts

## License

MIT License

Copyright (c) 2016-2021 Alex Czartoryski
https://business.czarto.com/

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

# The Scripts

## Automated AdGroup Bids
Set max CPC bids based on a sliding lookback window and based on a maximum cost of sales. Currently only sets bids at the adgroup level.
- <a href="https://github.com/Czarto/Adwords-Scripts/blob/master/keyword-and-adgroup-bids.js">keyword-and-adgroup-bids.js</a>

## Set Shopping ProductGroup bids to the AdGroup bid
Set product group CPC bids to the CPC bid of the AdGroup.
- <a href="https://github.com/Czarto/Adwords-Scripts/blob/master/shopping-setproductbid-to-adgroupbid.js">shopping-setproductbid-to-adgroupbid.js</a>

## Automated Bid Adjustments for GeoLocation, Schedule, and  Device
Set bid adjustments for GeoLocation, Schedule, and Device based on the relative conversion rates of each segment.
- Geolocations & Schedule: <a href="https://github.com/Czarto/Adwords-Scripts/blob/master/targeting-bid-adjustments.js">targeting-bid-adjustments.js</a>
- Device: <a href="https://github.com/Czarto/Adwords-Scripts/blob/master/device-bid-adjustments.js">device-bid-adjustments.js</a>
