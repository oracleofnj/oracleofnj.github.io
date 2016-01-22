var theApp = (function() {
    "use strict";
    var payoffChart;
    function proceedsChartData(rounds) {
        return d3.range(0,40,0.1).map(function(ln2x) {
            var totalProceeds = Math.pow(2,ln2x);
            var proceeds = vcComps.liquidationValues(rounds, totalProceeds);
            return {
                totalProceeds: totalProceeds,
                commonProceeds: proceeds.commonProceeds / 1e6,
                preferredProceeds: proceeds.preferredProceeds.map(function(d,i) {
                    return {proceeds: d.proceeds/rounds[i].invAmt, convert: d.convert};
                })
            };
        });
    };
    var addFinancing = function(e) {
        "use strict";
        var newRound = {};
        var rounds = $('#cap-table').data('rounds');

        newRound.invAmt = 1e6 * parseInt($('#investment-amount').val(),10);
        newRound.valuation = 1e6 * parseInt($('#valuation').val(),10);
        newRound.preMoney = ($('#financing-form input[name=pre-or-post]:checked').val() === 'pre');
        newRound.pariPassu = ($('#financing-form input[name=liquidation-preference-type]:checked').val() === 'pari');
        newRound.postMoneyValue = newRound.valuation + (newRound.preMoney ? newRound.invAmt : 0);
        newRound.percentOwnership = newRound.invAmt / newRound.postMoneyValue;
        newRound.shareCount = newRound.percentOwnership * vcComps.existingShares(rounds) / (1 - newRound.percentOwnership);
        newRound.liquidationPreferencePerShare = newRound.invAmt / newRound.shareCount;
        newRound.round = rounds.length;
        rounds.push(newRound);
        var pt = $('#PreferredTemplate').clone()
            .attr('id', 'preferred-financing-round-' + newRound.round)
            .addClass('preferred-financing-round')
            .removeClass('hidden');
        pt.children('.preferred-series').html('Series ' + String.fromCharCode('A'.charCodeAt(0)+newRound.round));
        pt.children('.preferred-share-count').html(newRound.shareCount.toLocaleString([],{maximumFractionDigits:0}));
        pt.children('.preferred-pref-per-share').html(newRound.liquidationPreferencePerShare.toLocaleString([],{maximumFractionDigits:2}));
        pt.children('.preferred-pref-type').html(newRound.pariPassu ? 'Pari' : 'Stacked');
        pt.children('.preferred-valuation-summary').html(newRound.invAmt / 1e6 + 'mm @ ' + newRound.valuation / 1e6 + 'mm ' + (newRound.preMoney ? 'Pre' : 'Post'));
        pt.data('shareCount',newRound.shareCount);
        pt.appendTo('#cap-table tbody');
        $('#cap-table').data('rounds', rounds);
        payoffChart.draw(proceedsChartData(rounds));
        e.preventDefault();
    };
    var updateLiquidationProceeds = function() {
        "use strict";
        var proceeds = vcComps.liquidationValues(
            $('#cap-table').data('rounds'),
            1e6*parseInt($('#liquidation-proceeds').val(),10)
        );
        $('#common-proceeds').html(proceeds.commonProceeds.toLocaleString([],{maximumFractionDigits: 0}));
        proceeds.preferredProceeds.forEach(function(res, idx) {
            $('#preferred-financing-round-' + idx).children('.preferred-proceeds').html(res.proceeds.toLocaleString([],{maximumFractionDigits: 0}));
            $('#preferred-financing-round-' + idx).children('.preferred-converted').html(res.convert ? 'Common' : 'Preferred');
        });
    }
    var updateExpectedValues = function() {
        "use strict";
        var rounds = $('#cap-table').data('rounds');
        var EVs = vcComps.payoffDistribution(
            rounds,
            1e6*parseFloat($('#modal-outcome').val()),
            parseFloat($('#outcome-vol').val())/100
        );
        $('#common-expected-value').html(EVs.expectedPayoffs.commonProceeds.toLocaleString([],{maximumFractionDigits: 0}));
        $('#common-ev-per-share').html((
            EVs.expectedPayoffs.commonProceeds / 3.6e7
        ).toLocaleString([],{maximumFractionDigits: 4}));
        EVs.expectedPayoffs.preferredProceeds.forEach(function(res, idx) {
            $('#preferred-financing-round-' + idx).children('.preferred-expected-value').html(res.toLocaleString([],{maximumFractionDigits: 0}));
            $('#preferred-financing-round-' + idx).children('.preferred-ev-per-share').html((
                res / rounds[idx].shareCount
            ).toLocaleString([],{maximumFractionDigits: 4}));
        });
    }
    var initCapTable = function() {
        "use strict";
        $('#cap-table').data('rounds',[]);
        payoffChart = vcCharts.waterfallPlot('liquidation-proceeds-chart');
    }
    return {
        addFinancing: addFinancing,
        initCapTable: initCapTable,
        proceedsChartData: proceedsChartData,
        updateLiquidationProceeds: updateLiquidationProceeds,
        updateExpectedValues: updateExpectedValues
    };
})();

$(document).ready(function(){
    "use strict";
    theApp.initCapTable();
    $('#financing-form').submit(theApp.addFinancing);
    $('#liquidation-proceeds').change(theApp.updateLiquidationProceeds);
    $('#pricing-parameters').find('input').change(theApp.updateExpectedValues);
});
