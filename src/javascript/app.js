Ext.define('custom-grid-with-deep-export', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),
    layout: {
        type: 'vbox',
        align: 'stretch'
    },
    items: [{
        id: Utils.AncestorPiAppFilter.RENDER_AREA_ID,
        xtype: 'container',
        layout: {
            type: 'hbox',
            align: 'middle',
            defaultMargins: '0 10 10 0',
        }
    }, {
        id: Utils.AncestorPiAppFilter.PANEL_RENDER_AREA_ID,
        xtype: 'container',
        layout: {
            type: 'hbox',
            align: 'middle',
            defaultMargins: '0 10 10 0',
        }
    }, {
        id: 'grid-area',
        xtype: 'container',
        flex: 1,
        type: 'vbox',
        align: 'stretch'
    }],
    config: {
        defaultSettings: {
            columnNames: ['FormattedID', 'Name', 'ScheduleState'],
            query: '',
            showControls: true,
            type: 'HierarchicalRequirement',
            pageSize: 50,
            enableUrlSharing: false
        }
    },

    integrationHeaders: {
        name: 'custom-grid-with-deep-export'
    },

    disallowedAddNewTypes: ['user', 'userprofile', 'useriterationcapacity', 'testcaseresult', 'task', 'scmrepository', 'project', 'changeset', 'change', 'builddefinition', 'build', 'program'],
    orderedAllowedPageSizes: [10, 25, 50, 100, 200],
    readOnlyGridTypes: ['build', 'change', 'changeset'],
    statePrefix: 'customlist',
    allowExpansionStateToBeSaved: false,
    enableAddNew: true,
    onTimeboxScopeChange(newTimeboxScope) {
        this.callParent(arguments);
        this._buildStore();
    },
    launch() {
        Rally.data.wsapi.Proxy.superclass.timeout = 240000;
        Rally.data.wsapi.batch.Proxy.superclass.timeout = 240000;
        this.ancestorFilterPlugin = Ext.create('Utils.AncestorPiAppFilter', {
            ptype: 'UtilsAncestorPiAppFilter',
            pluginId: 'ancestorFilterPlugin',
            settingsConfig: {},
            whiteListFields: [
                'Tags',
                'Milestones'
            ],
            filtersHidden: false,
            listeners: {
                scope: this,
                ready(plugin) {
                    Rally.data.util.PortfolioItemHelper.getPortfolioItemTypes().then({
                        scope: this,
                        success(portfolioItemTypes) {
                            this.portfolioItemTypes = _.sortBy(portfolioItemTypes, type => type.get('Ordinal'));

                            plugin.addListener({
                                scope: this,
                                select: this.viewChange,
                                change: this.viewChange
                            });
                            this.viewChange();
                        },
                        failure(msg) {
                            this._showError(msg);
                        },
                    });
                },
            }
        });
        this.addPlugin(this.ancestorFilterPlugin);
    },

    // Usual monkey business to size gridboards
    onResize() {
        this.callParent(arguments);
        let gridArea = this.down('#grid-area');
        let gridboard = this.down('rallygridboard');
        if (gridArea && gridboard) {
            gridboard.setHeight(gridArea.getHeight());
        }
    },

    _buildStore() {
        this.modelNames = [this.getSetting('type')];
        this.logger.log('_buildStore', this.modelNames);
        let fetch = ['FormattedID', 'Name'];
        let dataContext = this.getContext().getDataContext();
        if (this.searchAllProjects()) {
            dataContext.project = null;
        }

        Ext.create('Rally.data.wsapi.TreeStoreBuilder').build({
            models: this.modelNames,
            enableHierarchy: true,
            remoteSort: true,
            fetch,
            context: dataContext
        }).then({
            success: this._addGridboard,
            scope: this
        });
    },
    _addGridboard(store) {
        let gridArea = this.down('#grid-area');
        gridArea.removeAll();

        let currentModelName = this.modelNames[0];

        let filters = this.getSetting('query') ? [Rally.data.wsapi.Filter.fromQueryString(this.getSetting('query'))] : [];
        let timeboxScope = this.getContext().getTimeboxScope();
        if (timeboxScope && timeboxScope.isApplicable(store.model)) {
            filters.push(timeboxScope.getQueryFilter());
        }

        filters = filters.concat(this.ancestorFilterPlugin.getAllFiltersForType(currentModelName));

        this.logger.log('_addGridboard', store);

        let context = this.getContext();
        let dataContext = context.getDataContext();
        if (this.searchAllProjects()) {
            dataContext.project = null;
        }
        let summaryRowFeature = Ext.create('Rally.ui.grid.feature.SummaryRow');
        this.gridboard = gridArea.add({
            xtype: 'rallygridboard',
            context,
            modelNames: this.modelNames,
            toggleState: 'grid',
            height: gridArea.getHeight(),
            listeners: {
                scope: this,
                viewchange: this.viewChange,
            },
            plugins: [
                'rallygridboardaddnew',
                {
                    ptype: 'rallygridboardinlinefiltercontrol',
                    inlineFilterButtonConfig: {
                        stateful: true,
                        stateId: this.getModelScopedStateId(currentModelName, 'filters'),
                        modelNames: this.modelNames,
                        hidden: true,
                        inlineFilterPanelConfig: {
                            hidden: true,
                            quickFilterPanelConfig: {
                                portfolioItemTypes: this.portfolioItemTypes,
                                modelName: currentModelName,
                                whiteListFields: [
                                    'Tags',
                                    'Milestones'
                                ]
                            }
                        }
                    }
                },
                {
                    ptype: 'rallygridboardfieldpicker',
                    headerPosition: 'left',
                    modelNames: this.modelNames,
                    stateful: true,
                    stateId: this.getModelScopedStateId(currentModelName, 'fields'),
                    margin: '3 10 0 10'
                },
                {
                    ptype: 'rallygridboardactionsmenu',
                    menuItems: this._getExportMenuItems(),
                    buttonConfig: {
                        iconCls: 'icon-export'
                    }
                },
                {
                    ptype: 'rallygridboardsharedviewcontrol',
                    sharedViewConfig: {
                        enableUrlSharing: this.getSetting('enableUrlSharing'),
                        stateful: true,
                        stateId: this.getModelScopedStateId(currentModelName, 'views'),
                        stateEvents: ['select', 'beforedestroy']
                    },
                }
            ],
            cardBoardConfig: {
                attribute: 'ScheduleState'
            },
            gridConfig: {
                store,
                storeConfig: {
                    filters,
                    context: dataContext
                },
                columnCfgs: [
                    'Name',
                    {
                        dataIndex: 'PlanEstimate',
                        summaryType: 'sum'
                    },
                    {
                        dataIndex: 'TaskRemainingTotal',
                        summaryType: 'sum'
                    },
                    {
                        dataIndex: 'ToDo',
                        summaryType: 'sum'
                    },
                    {
                        dataIndex: 'TaskEstimateTotal',
                        summaryType: 'sum'
                    }
                ],
                features: [summaryRowFeature]
            }
        });
    },

    viewChange() {
        this._buildStore();
    },

    getModelScopedStateId(modelName, id) {
        return this.getContext().getScopedStateId(`${modelName}-${id}`);
    },

    _getExportMenuItems() {
        let result = [];
        this.logger.log('_getExportMenuItems', this.modelNames[0]);
        let currentModel = this.modelNames[0].toLowerCase();
        if (currentModel === 'hierarchicalrequirement') {
            result = [{
                text: 'Export User Stories...',
                handler: this._export,
                scope: this,
                childModels: ['hierarchicalrequirement']
            }, {
                text: 'Export User Stories and Tasks...',
                handler: this._export,
                scope: this,
                childModels: ['hierarchicalrequirement', 'task']
            }, {
                text: 'Export User Stories and Child Items...',
                handler: this._export,
                scope: this,
                childModels: ['hierarchicalrequirement', 'task', 'defect', 'testcase']
            }];
        } else if (Ext.String.startsWith(currentModel, 'portfolioitem')) {
            let piTypeNames = this.getPortfolioItemTypeNames();
            let idx = _.indexOf(piTypeNames, currentModel);
            let childModels = [];
            if (idx > 0) {
                for (let i = idx; i > 0; i--) {
                    childModels.push(piTypeNames[i - 1]);
                }
            }

            result = [{
                text: 'Export Portfolio Items...',
                handler: this._export,
                scope: this,
                childModels
            }, {
                text: 'Export Portfolio Items and User Stories...',
                handler: this._export,
                scope: this,
                childModels: childModels.concat(['hierarchicalrequirement'])
            }, {
                text: 'Export Portfolio Items, User Stories and Tasks...',
                handler: this._export,
                scope: this,
                childModels: childModels.concat(['hierarchicalrequirement', 'task'])
            }, {
                text: 'Export Portfolio Items and Child Items...',
                handler: this._export,
                scope: this,
                childModels: childModels.concat(['hierarchicalrequirement', 'task', 'defect', 'testcase'])
            }];
        } else if (currentModel == 'defect') {
            result = [{
                text: 'Export Defects...',
                handler: this._export,
                scope: this,
                childModels: []
            }, {
                text: 'Export Defects and Child Items...',
                handler: this._export,
                scope: this,
                childModels: ['defect', 'task', 'testcase']
            }];
        } else if (currentModel == 'testcase') {
            result = [{
                text: 'Export Test Cases...',
                handler: this._export,
                scope: this,
                childModels: []
            }, {
                text: 'Export Test Cases and Child Items...',
                handler: this._export,
                scope: this,
                childModels: ['defect', 'task', 'testcase']
            }];
        } else {
            result = [{
                text: 'Export to CSV...',
                handler: this._export,
                scope: this,
                childModels: []
            }];
        }

        return result;
    },
    getPortfolioItemTypeNames() {
        return _.map(this.portfolioItemTypes, type => type.get('TypePath').toLowerCase());
    },

    _showError(msg) {
        Rally.ui.notify.Notifier.showError({ message: msg });
    },
    _showStatus(message) {
        this.logger.log('_showstatus', message, this);
        if (message) {
            Rally.ui.notify.Notifier.showStatus({
                message,
                showForever: true,
                closable: false,
                animateShowHide: false
            });
        } else {
            Rally.ui.notify.Notifier.hide();
        }
    },
    _getExportColumns() {
        let grid = this.down('rallygridboard').getGridOrBoard();
        if (grid) {
            return _.filter(grid.columns, item => (
                item.dataIndex &&
                item.dataIndex != 'DragAndDropRank' &&
                item.xtype &&
                item.xtype != 'rallytreerankdraghandlecolumn' &&
                item.xtype != 'rallyrowactioncolumn' &&
                item.text != '&#160;'));
        }
        return [];
    },
    _getExportFilters() {
        let grid = this.down('rallygridboard'),
            filters = [],
            query = this.getSetting('query');

        if (grid.currentCustomFilter && grid.currentCustomFilter.filters) {
            // Concat any current custom filters (don't assign as we don't want to modify the currentCustomFilter array)
            filters = filters.concat(grid.currentCustomFilter.filters);
        }

        if (query) {
            filters.push(Rally.data.wsapi.Filter.fromQueryString(query));
        }

        let timeboxScope = this.getContext().getTimeboxScope();
        if (timeboxScope && timeboxScope.isApplicable(grid.getGridOrBoard().store.model)) {
            filters.push(timeboxScope.getQueryFilter());
        }

        filters = filters.concat(this.ancestorFilterPlugin.getAllFiltersForType(this.modelNames[0]));

        return filters;
    },
    _getExportFetch() {
        let fetch = _.pluck(this._getExportColumns(), 'dataIndex');
        if (Ext.Array.contains(fetch, 'TaskActualTotal')) {
            fetch.push('Actuals');
        }
        return fetch;
    },
    _getExportSorters() {
        return this.down('rallygridboard').getGridOrBoard().getStore().getSorters();
    },
    _export(args) {
        let columns = this._getExportColumns(),
            fetch = this._getExportFetch(),
            filters = this._getExportFilters(),
            modelName = this.modelNames[0],
            childModels = args.childModels,
            sorters = this._getExportSorters();

        this.logger.log('_export', fetch, args, columns, filters.toString(), childModels, sorters);

        let exporter = Ext.create('Rally.technicalservices.HierarchyExporter', {
            modelName,
            fileName: 'hierarchy-export.csv',
            columns,
            portfolioItemTypeObjects: this.portfolioItemTypes

        });
        exporter.on('exportupdate', this._showStatus, this);
        exporter.on('exporterror', this._showError, this);
        exporter.on('exportcomplete', this._showStatus, this);

        let dataContext = this.getContext().getDataContext();
        if (this.searchAllProjects()) {
            dataContext.project = null;
        }
        let hierarchyLoader = Ext.create('Rally.technicalservices.HierarchyLoader', {
            model: modelName,
            fetch,
            filters,
            sorters,
            loadChildModels: childModels,
            portfolioItemTypes: this.portfolioItemTypes,
            context: dataContext
        });
        hierarchyLoader.on('statusupdate', this._showStatus, this);
        hierarchyLoader.on('hierarchyloadartifactsloaded', exporter.setRecords, exporter);
        hierarchyLoader.on('hierarchyloadcomplete', exporter.export, exporter);
        hierarchyLoader.on('hierarchyloaderror', this._showError, this);
        hierarchyLoader.load();
    },
    getHeight() {
        let el = this.getEl();
        if (el) {
            let height = this.callParent(arguments);
            return Ext.isIE8 ? Math.max(height, 600) : height;
        }

        return 0;
    },

    setHeight(height) {
        this.callParent(arguments);
        if (this.gridboard) {
            this.gridboard.setHeight(height);
        }
    },
    getOptions() {
        return [{
            text: 'About...',
            handler: this._launchInfo,
            scope: this
        }];
    },

    _launchInfo() {
        if (this.about_dialog) { this.about_dialog.destroy(); }
        this.about_dialog = Ext.create('Rally.technicalservices.InfoLink', {});
    },

    isExternal() {
        return typeof (this.getAppId()) === 'undefined';
    },

    searchAllProjects() {
        return this.ancestorFilterPlugin.getIgnoreProjectScope();
    },

    getSettingsFields() {
        return Rally.technicalservices.CustomGridWithDeepExportSettings.getFields();
    }
});
