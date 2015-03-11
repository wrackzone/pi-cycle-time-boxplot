Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    launch: function() {
        //Write app code here

        //API Docs: https://help.rallydev.com/apps/2.0/doc/
    },
    
    config: {
        defaultSettings : {
            ShowMonths : true,
            PortfolioItemType : "PortfolioItem/Feature",
            BeginState : "",
            EndState : "",
            CompletedState : ""
        }
    },
	
	getSettingsFields: function() {

        return [
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


		];
	}

});
