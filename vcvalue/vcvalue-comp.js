var vcComps = (function() {
    "use strict";

    var existingShares = function(rounds) {
        "use strict";
        return rounds.reduce(function(a, b) {
            return {shareCount: a.shareCount + b.shareCount};
        }, {shareCount: 36000000}).shareCount;
    }
    var liquidationValues = function(rounds, totalProceeds) {
        "use strict";
        var commonProceeds=totalProceeds, pariProceeds=0, stackedProceeds=0;
        var commonShares = existingShares(rounds), pariDollars=0;
        var result = [];
        for (var i=rounds.length-1; i >= 0; i--) {
            result[i] = {};
            var valueAsCommon = commonProceeds / commonShares;
            if (valueAsCommon < rounds[i].liquidationPreferencePerShare) {
                var amtToPreferred = Math.min(commonProceeds,
                    rounds[i].liquidationPreferencePerShare * rounds[i].shareCount);
                commonProceeds -= amtToPreferred;
                commonShares -= rounds[i].shareCount;
                if (rounds[i].pariPassu) {
                    pariDollars += rounds[i].liquidationPreferencePerShare * rounds[i].shareCount;
                    pariProceeds += amtToPreferred;
                } else {
                    result[i].proceeds = amtToPreferred;
                }
                result[i].convert = false;
            } else {
                result[i].convert = true;
            }
        }
        for (i=0; i < rounds.length; i++) {
            if (result[i].convert) {
                result[i].proceeds = commonProceeds * rounds[i].shareCount / commonShares;
            } else if (rounds[i].pariPassu) {
                result[i].proceeds = pariProceeds * rounds[i].liquidationPreferencePerShare * rounds[i].shareCount / pariDollars;
            }
        }
        return {
            commonProceeds: commonProceeds * 36000000 / commonShares,
            preferredProceeds: result
        };
    }

    var payoffDistribution = function(rounds, modalPayoff, lnVolatility) {
        var cumProb = 0;
        var g = gaussian(Math.log(modalPayoff), lnVolatility*lnVolatility);
        var payoffs = d3.range(0.05,40,0.1).map(function(ln2x) {
            var totalProceeds = Math.pow(2, ln2x-0.05), upperBound = Math.pow(2, ln2x);
            var ln2xPayoff = {
                totalProceeds: totalProceeds,
                liquidationValues: liquidationValues(rounds, totalProceeds),
                payoffProbability: g.cdf(Math.log(upperBound)) - cumProb,
                cumProb: cumProb
            }
            cumProb += ln2xPayoff.payoffProbability;
            return ln2xPayoff;
        });
        payoffs.push({
            totalProceeds: Math.pow(2, 40),
            liquidationValues: liquidationValues(rounds, Math.pow(2, 40)),
            payoffProbability: 1 - cumProb,
            cumProb: 1
        });
        var expectedPayoffs = payoffs.reduce(function(a, b) {
            return {
                commonProceeds: a.commonProceeds + b.liquidationValues.commonProceeds * b.payoffProbability,
                preferredProceeds: a.preferredProceeds.map(function(d,i) {
                    return d + b.payoffProbability * b.liquidationValues.preferredProceeds[i].proceeds;
                })
            }
        }, {
            commonProceeds: 0,
            preferredProceeds: payoffs[0].liquidationValues.preferredProceeds.map(function() {return 0;})
        });
        expectedPayoffs.totalProceeds = expectedPayoffs.commonProceeds + expectedPayoffs.preferredProceeds.reduce(function(a,b) {
            return a + b;
        });
        return {
            payoffs: payoffs,
            expectedPayoffs: expectedPayoffs
        };
    };

    return {
        existingShares: existingShares,
        liquidationValues: liquidationValues,
        payoffDistribution: payoffDistribution
    };
})();
