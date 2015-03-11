Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',

    constructor: function(config) {

        if (typeof(CustomAppConfig) !== 'undefined') {
            Ext.apply(config, CustomAppConfig);
        }
        this.callParent(arguments);

        this._workspaceConfig = this.getContext().getWorkspace().WorkspaceConfiguration;

        console.log(this.getSetting("NumberPeriods"));

        this._xAxisStrategies = {
            'fiscalQuarter': new FiscalQuarters(this.getStartOn(), this.getEndBefore(), this._workspaceConfig.TimeZone),
            'month': new Months(this.getStartOn(), this.getEndBefore(), this._workspaceConfig.TimeZone),
            'storyPoints': new StoryPoints(),
            'featureSize': new FeatureSize(),
            'quarter': new Quarters(this.getStartOn(), this.getEndBefore(), this._workspaceConfig.TimeZone)
        };

        this._xAxisStrategy = this._xAxisStrategies[this.getSetting("ShowMonths")===true ? "month":"quarter"];

        this._typeStrategy = new Feature(
            this.getSetting("PortfolioItemType"),
            this.getSetting("BeginState"),
            this.getSetting("EndState"),
            this.getSetting("CompletedState"));


        console.log(this._typeStrategy);

        Deft.Promise.all([
            this._getPortfolioItemTypes(),
            this._getPreliminaryEstimateValues(),
            this._getTISCSnapshots(),
            this._getCompletedOids()
        ]).then({
            success: Ext.bind(this._onLoad, this)
        });
    },

    _onLoad: function(loaded) {

        console.log("loaded",loaded);
        var snapshots = loaded[2];
        var completedOids = loaded[3];

        var tiscResults = this._getTISCResults(snapshots);

        var convertTicksToHours = Ext.bind(function(row) {
            return row.ticks / this._workDayHours;
        }, this);

        var getCategory = Ext.bind(function(row) {
            return this._xAxisStrategy.categorize(row);
        }, this);

        var deriveFieldsOnOutput = Ext.Array.map([1,25, 50, 75,99], function(percentile) {
            var p = Lumenize.functions.percentileCreator(percentile);
            return {
                field: "P" + percentile,
                f: function(row) {
                    return p(row.hours_values);
                }
            };
        });

        var cube = new OLAPCube({
            deriveFieldsOnInput: [
                { field: "hours", f: convertTicksToHours },
                { field: "category", f: getCategory }
            ],
            metrics: [
                { field: "hours", f: "values" },
                { field: "hours", f: "average", as: "timeInProcessAverage" }
            ],
            deriveFieldsOnOutput: deriveFieldsOnOutput,
            dimensions: [
                { field: "category" }
            ]
        });

        var tiscResultsFilteredByCompletion = Ext.Array.filter(tiscResults, function(result) {
            return !!completedOids[result.ObjectID];
        });
        console.log("facts",tiscResultsFilteredByCompletion);
        cube.addFacts(tiscResultsFilteredByCompletion);

        var rowValues = cube.getDimensionValues("category");

        _.each(rowValues,function(rv) {
                console.log(rv,cube.getCell({category:rv}))
        })

        this._showChartData(cube);

    },


    launch: function() {
        
        //Write app code here

        //API Docs: https://help.rallydev.com/apps/2.0/doc/
    },

    _getPortfolioItemTypes : function() {
        var deferred = new Deft.Deferred();
        Ext.create('Rally.data.WsapiDataStore', {
            autoLoad : true,
            limit : "Infinity",
            model : "TypeDefinition",
            fetch : ['Name','ObjectID','TypePath'], 
            filters : [ { property:"Ordinal", operator:">=", value:0} ],
            listeners : {
                scope : this,
                load : function(store, data) {
                    var recs = _.map(data,function(d){return d.data;});
                    deferred.resolve(recs);
                }
            }
        });
        return deferred.getPromise();
    },

    _getPreliminaryEstimateValues : function() {
        var deferred = new Deft.Deferred();
        Ext.create('Rally.data.WsapiDataStore', {
            autoLoad : true,
            limit : "Infinity",
            model : "PreliminaryEstimate",
            fetch : ['Name','ObjectID','Value'], 
            filters : [],
            listeners : {
                scope : this,
                load : function(store, data) {
                    var recs = _.map(data,function(d){return d.data;});
                    deferred.resolve(recs);
                }
            }
        });
        return deferred.getPromise();
    },

    _getTISCSnapshots: function() {
        // console.log("_getTISCSnapshots", this.getStartOn(), this.getEndBefore());
        var query = this._getProjectScopedQuery(
            Ext.merge({
                '_ValidFrom': {
                    '$gte': this.getStartOn(),
                    '$lt': this.getEndBefore()
                }
            }, this._typeStrategy.progressPredicate()));
        console.log("query:",query);


        var deferred = new Deft.Deferred();
        Ext.create('Rally.data.lookback.SnapshotStore', {
            autoLoad : true,
            limit: Infinity,
            listeners: {
                refresh: function(store) {
                    //Extract the raw snapshot data...
                    var snapshots = [];
                    for (var i = 0, ii = store.getTotalCount(); i < ii; ++i) {
                        snapshots.push(store.getAt(i).data);
                    }
                    // console.log("tisc",snapshots);
                    deferred.resolve(snapshots);
                }
            },
            fetch: ['ObjectID', '_ValidTo', '_ValidFrom','PreliminaryEstimate','LeafStoryPlanEstimateTotal'].concat(this._xAxisStrategy.field),
            find: query
        });
        return deferred.getPromise();
    },

    _getProjectScopedQuery: function(query) {

        // return query;

        //TODO - support scope up/down and all that cool stuff
        return Ext.merge({
            //'_ProjectHierarchy': Number((!_.isUndefined(__PROJECT_OID__) ? __PROJECT_OID__ : this.getContext().getProject().ObjectID) 
            '_ProjectHierarchy': { "$in" : [Number(this.getContext().getProject().ObjectID)] }
        }, query);
    },

    _getCompletedOids: function(type, afterCompletedOIDs){
        var deferred = new Deft.Deferred();
        Ext.create('Rally.data.lookback.SnapshotStore', {
            autoLoad : true,
            limit: Infinity,
            listeners: {
                refresh: function(store) {
                    //Build map of completed oids
                    var completedOids = {};
                    store.each(function(model) {
                        completedOids[model.data.ObjectID] = true;
                    });
                    // console.log("completed",completedOids);
                    deferred.resolve(completedOids);
                }
            },
            fetch: ['ObjectID'],
            find: this._getProjectScopedQuery(Ext.merge({
                '__At': this.getEndBefore()
            }, this._typeStrategy.completePredicate()))
        });
        return deferred.getPromise();
    },


    _getTISCResults: function(snapshots) {

        var config = {
            granularity: 'hour',
            tz: this._workspaceConfig.TimeZone,
            //workDays: this._workspaceConfig.WorkDays.split(','),
            workDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
            endBefore: this.getEndBefore(),

            // assume 9-5
            workDayStartOn: {hour: 9, minute: 0},
            workDayEndBefore: {hour: 17, minute: 0},

            //holidays: this._federalHolidays(),

            trackLastValueForTheseFields: [this._xAxisStrategy.field]
        };

        // store number of hours in a work day
        var startOnInMinutes = config.workDayStartOn.hour * 60 + config.workDayStartOn.minute;
        var endBeforeInMinutes = config.workDayEndBefore.hour * 60 + config.workDayEndBefore.minute;
        if (startOnInMinutes < endBeforeInMinutes) {
            workMinutes = endBeforeInMinutes - startOnInMinutes;
        } else{
          workMinutes = 24 * 60 - startOnInMinutes;
          workMinutes += endBeforeInMinutes;
        }
        this._workDayHours = workMinutes / 60;

        var tisc = new TimeInStateCalculator(config);
        tisc.addSnapshots(snapshots, this.getStartOn(), this.getEndBefore());

        var results = tisc.getResults();
        return results;
    },

    _showChartData: function(cube) {

        var catField = _.first(cube.config.dimensions).field;
        var xField = _.last(cube.config.dimensions).field;
        var categories = cube.getDimensionValues(catField);
        var xvalues = cube.getDimensionValues(xField);

        console.log("categories",_.first(cube.config.dimensions).field,categories);

        var keys = ['P1','P25','P50','P75','P99']

        var series = _.map(categories,function(cat) {
            return {
                name : 'Series:' + cat,
                data : _.map(xvalues,function(xvalue) {
                    var cellKey = {};
                    cellKey[catField] = cat;
                    cellKey[xField] = xvalue;
                    var v = cube.getCell(cellKey);
                    return !_.isUndefined(v) ? _.map(keys,function(k) {return v[k];}) : null;
                })
            }
        });

        console.log("series",series);
        
        var chart = this.down("#chart1");
        if (chart) chart.removeAll();
        
        this._extChart = Ext.create('Rally.ui.chart.Chart', {
            height: 500,
            chartData: {
                categories: categories,
                series : series
            },
            chartConfig : {
                chart: {
                    type: 'boxplot'
                    // zoomType: 'xy'
                },
                title: {
                    text: 'Time in Process'
                },                        
                xAxis: {
                    tickInterval : 1,
                    title: {
                        text: this._xAxisStrategy.label
                    }
                },
                yAxis: [{
                    title: {
                        text: 'Time in Process (days)'
                    },
                    plotLines: [{
                        value: 0,
                        width: 1,
                        color: '#808080'
                    }]
                }],
                tooltip: {
                    valueSuffix : ' days',
                    shared: true
                },
                legend: {
                    align: 'center',
                    verticalAlign: 'bottom'
                }
            }
        });
        chart.add(this._extChart);
        this._extChart._unmask();
    },

    
    config: {
        startOn: new Time(new Date()).inGranularity(Time.MONTH).add(-6).toString(),
        endBefore: new Time(new Date()).inGranularity(Time.MONTH).add(0).toString(),
        xAxis: 'month',
        type: 'PortfolioItem/Feature',

        defaultSettings : {
            NumberPeriods : 6,
            ShowMonths : true,
            PortfolioItemType : "PortfolioItem/Feature",
            BeginState : null,
            EndState : "Done",
            CompletedState : "Done",
            GroupByField : ""
        }
    },
	
	getSettingsFields: function() {

        var values = [
            {
                name: 'NumberPeriods',
                xtype: 'rallytextfield',
                label: 'Number of time periods to report on eg. 6'
            },
            {
                name: 'ShowMonths',
                xtype: 'rallycheckboxfield',
                label: 'True for months (otherwise quarters)'
            },
            {
                name: 'PortfolioItemType',
                xtype: 'rallytextfield',
                label: 'Name of the type eg. PortfolioItem/Initiative'
            },
            {
                name: 'BeginState',
                xtype: 'rallytextfield',
                label: 'Name of the beginning state the cycle time is calculated for'
            },
            {
                name: 'EndState',
                xtype: 'rallytextfield',
                label: 'Name of the end state the cycle time is calculated for'
            },
            {
                name: 'CompletedState',
                xtype: 'rallytextfield',
                label: 'Name of the state which signifies the item is completed and should be reported on'
            },
            {
                name: 'GroupByField',
                xtype: 'rallytextfield',
                label: 'Field to group the results by eg. PreliminaryEstimate'
            },
		];
        _.each(values,function(value){
            value.labelWidth = 250;
            value.labelAlign = 'left'
        });
        return values;
	},
     items : [
        {
            xtype: 'container',
            itemId: 'chart1',
            columnWidth: 1
        }
    ]


});
