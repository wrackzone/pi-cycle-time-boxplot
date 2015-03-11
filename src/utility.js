
//Get reference to Lumenize
var Lumenize = window.parent.Rally.data.lookback.Lumenize,
    OLAPCube = Lumenize.OLAPCube,
    Time = Lumenize.Time,
    TimeInStateCalculator = Lumenize.TimeInStateCalculator;

function Months(startOn, endBefore, timezone) {
    var cursor = new Time(startOn).inGranularity(Time.MONTH),
        end = new Time(endBefore).inGranularity(Time.MONTH),
        categories = [];

    while (cursor.lessThanOrEqual(end)) {
        categories.push(cursor.toString());
        cursor = cursor.add(1);
    }

    this.categories = categories;
    this.label = 'Months';
    this.field = '_ValidTo';

    this.categorize = function(value) {
        
        return new Time(value._ValidTo_lastValue, Time.MONTH, timezone).inGranularity(Time.MONTH).toString();
    };
}

function Quarters(startOn, endBefore, timezone) {
    var cursor = new Time(startOn).inGranularity(Time.QUARTER),
        end = new Time(endBefore).inGranularity(Time.QUARTER),
        categories = [];

    while (cursor.lessThanOrEqual(end)) {
        categories.push(cursor.toString());
        cursor = cursor.add(1);
    }

    this.categories = categories;
    this.label = 'Quarters';
    this.field = '_ValidTo';

    this.categorize = function(value) {
        return new Time(value._ValidTo_lastValue, Time.QUARTER, timezone).inGranularity(Time.QUARTER).toString();
    };
}

function FiscalQuarters(startOn, endBefore, timezone) {
    this.label = 'Fiscal Quarters';
    this.field = '_ValidTo';

    this.categorize = function(value) {
        var validToTimeString = value._ValidTo_lastValue || value;

        //Assumes fiscal quarters are offset 1 month (in the future) from calendar quarters
        //The algorithm goes like this:
        // 1) Find the calendar quarter of the validToTimeString
        // 2) Find the start month of the calendar quarter
        // 3) Add 1 month to the start month of the calendar quarter to find
        //    the start month of the fiscal quarter.
        // 4) If the validTo time (in month granularity) is less than the start
        //    of the fiscal quarter, go back to the previous calendar quarter,
        //    otherwise use the calendar quarter we found in step 1.
        // 5) Format the calendar quarter as a fiscal quarter.
        var calendarQuarter = new Time(validToTimeString, Time.QUARTER, timezone).inGranularity(Time.QUARTER);
        var calendarQuarterStart = calendarQuarter.inGranularity(Time.MONTH);
        var fiscalQuarterStart = calendarQuarterStart.add(1);
        var validTo = new Time(validToTimeString, Time.MONTH, timezone).inGranularity(Time.MONTH);

        var quarter;
        if (validTo.lessThan(fiscalQuarterStart)) {
            quarter = calendarQuarter.add(-1);
        } else {
            quarter = calendarQuarter;
        }

        var year = (quarter.year + 1).toString();
        return 'FY' + year.substring(2) + 'Q' + quarter.quarter;
    };

    var cursor = new Time(startOn).inGranularity(Time.QUARTER),
        end = new Time(endBefore).inGranularity(Time.QUARTER),
        categories = [];

    while (cursor.lessThanOrEqual(end)) {
        categories.push(this.categorize(cursor.toString()));
        cursor = cursor.add(1);
    }

    this.categories = categories;
}

function StoryPoints() {

    this.categories = ['&lt; 1', '2', '3', '5', '8', '&gt; 8'];
    this.label = 'Story Points';
    this.field = 'PlanEstimate';

    this.categorize = function(value) {
        var p = value.PlanEstimate_lastValue;
        if (p < 1) {
            return '&lt; 1';
        } else if (p <= 2) {
            return '2';
        } else if (p <= 3) {
            return '3';
        } else if (p <= 5) {
            return '5';
        } else if (p <= 8) {
            return '8';
        } else if (p > 8) {
            return '&gt; 8';
        }
    };
}

// function FeatureSize() {
//     this.categories = ['Extra Small', 'Small', 'Medium', 'Large', 'Extra Large', 'Unestimated'];
//     this.label = 'Feature Size';
//     this.field = 'PreliminaryEstimate';

//     var sizes = {
//         4484657773: 'Extra Small',
//         4484657774: 'Small',
//         4484657775: 'Medium',
//         4484657776: 'Large',
//         4484657777: 'Extra Large'
//     };

//     this.categorize = function(value) {
//         return sizes[value.PreliminaryEstimate_lastValue] || 'Unestimated';
//     };
// }

function FeatureSize() {
    this.categories = ['Extra Small', 'Small', 'Medium', 'Large', 'Extra Large', 'Unestimated'];
    this.label = 'Feature Size';
    this.field = 'PreliminaryEstimate';

    var sizes = {
        4484657773: 'Extra Small',
        4484657774: 'Small',
        4484657775: 'Medium',
        4484657776: 'Large',
        4484657777: 'Extra Large'
    };

    this.categorize = function(value) {
        return sizes[value.PreliminaryEstimate_lastValue] || 'Unestimated';
    };
}


// function Feature() {
//     var typeHierarchy = 'PortfolioItem/Feature';
//     this.progressPredicate = function() {
//         return {
//             // Features in development and < 100 % done
//             '_TypeHierarchy': typeHierarchy,
//             'State': {
//                 '$gte': 'Prep',
//                 '$lt': 'In Dev'
//             }
//         };
//     };
//     this.completePredicate = function() {
//         return {
//             // Features not in development anymore or >= 100% done
//             '_TypeHierarchy': typeHierarchy,
//             'State': {
//                 '$gte': 'In Dev'
//             }
//         };
//     };
// }

function Feature(type,beginState,endState,completeState) {
    // var typeHierarchy = 'PortfolioItem/Feature';
    this.typeHierarchy = type;
    this.beginState    = beginState;
    this.endState      = endState;
    this.completeState = completeState;

    this.progressPredicate = function() {
        return {
            // Features in development and < 100 % done
            '_TypeHierarchy': this.typeHierarchy,
            'State': {
                '$gte': this.beginState,
                '$lt': this.endState
            }
        };
    };
    this.completePredicate = function() {
        return {
            // Features not in development anymore or >= 100% done
            '_TypeHierarchy': this.typeHierarchy,
            'State': {
                // '$gte': 'In Dev'
                '$gte' : this.completeState
            }
        };
    };
}


function HierarchicalRequirement() {
    var typeHierarchy = 'HierarchicalRequirement';
    this.progressPredicate = function() {
        return {
            // Leaf stories in progress
            '_TypeHierarchy': typeHierarchy,
            'ScheduleState': {
                '$gte': 'In-Progress',
                '$lt': 'Accepted'
            },
            'Children': null
        };
    };
    this.completePredicate = function() {
        return {
            // Leaf stories accepted
            '_TypeHierarchy': typeHierarchy,
            'ScheduleState': {
                '$gte': 'Accepted'
            },
            'Children': null
        };
    };
}