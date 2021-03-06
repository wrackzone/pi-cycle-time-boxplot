
//Get reference to Lumenize
var Lumenize = window.parent.Rally.data.lookback.Lumenize,
    OLAPCube = Lumenize.OLAPCube,
    Time = Lumenize.Time,
    TimeInStateCalculator = Lumenize.TimeInStateCalculator;

function Months(startOn, endBefore, timezone) {
    console.log(startOn,endBefore,timezone);
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

        // return new Time(value._ValidTo_lastValue, Time.MONTH, timezone).inGranularity(Time.MONTH).toString();
        return new Time(value._ValidFrom_lastValue, Time.MONTH, timezone).inGranularity(Time.MONTH).toString();
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

function FeatureSize(preliminaryEstimateValues) {

    this.nameIt = function(value) {
        return !_.isUndefined(value) ? value.Name + " (" + value.Value + ")" : "Unestimated";
    };
    this.categorize = function(value) {
        var v = _.find(this.values,function(val) { 
            return val.ObjectID === value.PreliminaryEstimate_lastValue;
        })
        return v ? this.nameIt(v) : 'Unestimated';
    };

    this.values = preliminaryEstimateValues;
    var that = this;
    this.categories = _.map(this.values,function(pev) {
        return that.nameIt(pev);
    });
    this.label = 'Feature Size';
    this.field = 'PreliminaryEstimateValue';

}

function GroupValueField(typedef) {
    var that = this;
    that.typedef = typedef;
    that.label = that.typedef.Name;
    that.field = that.typedef.ElementName;
    this.categorize = function(value) {
        // console.log("value:",value,that.field);
        // return value[that.field];
        return value[that.field+"_lastValue"];
    };
}

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
                '$gte': (this.beginState === "No Entry") ? null : this.beginState,
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