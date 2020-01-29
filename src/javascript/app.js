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
        itemId: 'grid-area',
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
    onTimeboxScopeChange() {
        this.callParent(arguments);
        this._clearSharedViewCombo();
        this._buildStore();
    },
    launch() {
        Rally.data.wsapi.Proxy.superclass.timeout = 180000;
        Rally.data.wsapi.batch.Proxy.superclass.timeout = 180000;
        this.settingView = true;

        this.down('#' + Utils.AncestorPiAppFilter.PANEL_RENDER_AREA_ID).on('resize', this.onResize, this);

        this.gridArea = this.down('#grid-area');
        let type = this.getSetting('type');
        let additionalFilter = this.getSetting('additionalFilterField');

        this.ancestorFilterPlugin = Ext.create('Utils.AncestorPiAppFilter', {
            ptype: 'UtilsAncestorPiAppFilter',
            pluginId: 'ancestorFilterPlugin',
            settingsConfig: {},
            whiteListFields: [
                'Tags',
                'Milestones',
                'c_EnterpriseApprovalEA'
            ],
            filtersHidden: false,
            visibleTab: type,
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

                            if (type && additionalFilter) {
                                let label = this.getSetting('additionalFilterLabel');
                                if (!label) {
                                    label = additionalFilter.indexOf('c_') === 0 ? additionalFilter.substring(2) : additionalFilter;
                                }
                                this.down('#' + Utils.AncestorPiAppFilter.RENDER_AREA_ID).add({
                                    xtype: 'rallyfieldvaluecombobox',
                                    itemId: 'additionalFilterCombo',
                                    model: type,
                                    field: additionalFilter,
                                    labelStyle: 'font-size: medium',
                                    allowBlank: false,
                                    allowNoEntry: false,
                                    defaultSelectionPosition: 'first',
                                    fieldLabel: label,
                                    labelWidth: label.length * 10,
                                    listeners: {
                                        scope: this,
                                        change: this.viewChange,
                                        ready: () => {
                                            this.settingView = false;
                                            this.viewChange();
                                        }
                                    }
                                });
                            }
                            else {
                                this.settingView = false;
                                this.viewChange();
                            }
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
        let gridboard = this.down('rallygridboard');
        if (this.gridArea && gridboard) {
            gridboard.setHeight(this.gridArea.getHeight());
        }
    },

    _buildStore() {
        // This object helps us cancel a load that is waiting for filters to be returned
        let thisStatus = { loadingFailed: false, cancelLoad: false };
        this._cancelPreviousLoad(thisStatus);

        this._setLoading(true);
        this.gridArea.removeAll(true);
        this._addCancelBtn(false);

        this.modelNames = [this.getSetting('type')];
        this.logger.log('_buildStore', this.modelNames);
        let fetch = ['FormattedID', 'Name'];
        let dataContext = this.getContext().getDataContext();
        if (this.searchAllProjects()) {
            dataContext.project = null;
        }

        Ext.create('Rally.data.wsapi.TreeStoreBuilder').build({
            id: 'gridboardStore',
            models: this.modelNames,
            enableHierarchy: true,
            remoteSort: true,
            fetch,
            context: dataContext,
            enablePostGet: true,
            listeners: {
                scope: this,
                error: function () {
                    this._showError('Error loading tree store. Try adjusting your filters to reduce the result set.');
                }
            },
        }).then({
            success: (store) => {
                if (thisStatus.loadingFailed || thisStatus.cancelLoad) {
                    this.setLoading(false);
                    return;
                }
                this._addGridboard(store, thisStatus);
            },
            scope: this
        });
    },
    async _addGridboard(store, thisStatus) {

        let currentModelName = this.modelNames[0];
        let stateIdForType = Ext.String.startsWith(currentModelName.toLowerCase(), 'portfolioitem') ? 'CA.customgridportfolioitems' : 'CA.customgridothers';

        let filters = this.getSetting('query') ? [Rally.data.wsapi.Filter.fromQueryString(this.getSetting('query'))] : [];
        let timeboxScope = this.getContext().getTimeboxScope();
        if (timeboxScope && timeboxScope.isApplicable(store.model)) {
            filters.push(timeboxScope.getQueryFilter());
        }

        let ancestorAndMultiFilters = await this.ancestorFilterPlugin.getAllFiltersForType(currentModelName, true).catch((e) => {
            Rally.ui.notify.Notifier.showError({ message: (e.message || e) });
            thisStatus.loadingFailed = true;
        });

        if (thisStatus.loadingFailed) {
            this._setLoading(false);
            return;
        }

        if (thisStatus.cancelLoad) {
            return;
        }

        if (ancestorAndMultiFilters) {
            filters = filters.concat(ancestorAndMultiFilters);
        }

        let additionalFilter = this.getSetting('additionalFilterField');

        if (additionalFilter) {
            let additionalFilterValue = this.down('#additionalFilterCombo').getValue();
            if (additionalFilterValue || typeof additionalFilterValue === 'string') {
                filters.push(new Rally.data.wsapi.Filter({
                    property: additionalFilter,
                    value: additionalFilterValue
                }));
            }
        }

        this.logger.log('_addGridboard', store);

        let context = this.getContext();
        let dataContext = context.getDataContext();
        if (this.searchAllProjects()) {
            dataContext.project = null;
        }
        let summaryRowFeature = Ext.create('Rally.ui.grid.feature.SummaryRow');

        let columnConfig = [];
        if (Ext.String.startsWith(currentModelName.toLowerCase(), 'portfolioitem')) {
            columnConfig = [
                'FormattedID',
                'Name',
                'Release',
                'State',
                'PercentDoneByStoryPlanEstimate',
                'PercentDoneByStoryCount',
                'Project',
                'Owner',
                'ScheduleState'
            ];
        } else {
            columnConfig = [
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
            ];
        }

        this.gridboard = this.gridArea.add({
            xtype: 'rallygridboard',
            context,
            stateful: true,
            stateId: stateIdForType,
            modelNames: this.modelNames,
            toggleState: 'grid',
            height: this.gridArea.getHeight(),
            listeners: {
                scope: this,
                viewchange: this.viewChange,
                load: function () {
                    this._setLoading(false);
                }
            },
            plugins: [
                'rallygridboardaddnew',
                {
                    ptype: 'rallygridboardinlinefiltercontrol',
                    inlineFilterButtonConfig: {
                        stateful: true,
                        stateId: this.getContext().getScopedStateId('CA.customGridWithDeepExportFilterHidden'),
                        modelNames: this.modelNames,
                        hidden: true,
                        inlineFilterPanelConfig: {
                            hidden: true,
                            quickFilterPanelConfig: {
                                portfolioItemTypes: this.portfolioItemTypes,
                                modelName: currentModelName,
                                whiteListFields: ['Tags', 'Milestones', 'c_EnterpriseApprovalEA']
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
                        itemId: 'sharedViewCombo',
                        stateful: true,
                        stateId: this.getModelScopedStateId(currentModelName, 'views'),
                        stateEvents: ['select', 'change', 'beforedestroy'],
                        context: this.getContext()
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
                    context: dataContext,
                    enablePostGet: true
                },
                stateful: true,
                stateId: stateIdForType + 'TreeGrid',
                columnCfgs: columnConfig,
                features: [summaryRowFeature]
            }
        });
    },

    _cancelPreviousLoad: function (newStatus) {
        if (this.globalStatus) {
            this.globalStatus.cancelLoad = true;
        }
        this.globalStatus = newStatus;

        // If there is a current chart store, force it to stop loading pages
        // Note that recreating the grid will then create a new chart store with
        // the same store ID.
        var gridboardStore = Ext.getStore('gridboardStore');
        if (gridboardStore) {
            gridboardStore.cancelLoad();
        }
    },

    viewChange() {
        if (this.settingView) {
            return;
        }
        this._clearSharedViewCombo();
        this._buildStore();
    },

    _clearSharedViewCombo: function () {
        let combo = this.down('#sharedViewCombo');
        if (!this.settingView && combo) {
            combo.setValue('');
            combo._clearParameters();
            combo.saveState();
        }
    },

    getModelScopedStateId(modelName, id) {
        return this.getContext().getScopedStateId(`${modelName}-${id}`);
    },

    _addCancelBtn(hidden) {
        let width = this.gridArea.getEl().getWidth();
        let height = this.gridArea.getEl().getHeight();
        this.gridArea.add({
            xtype: 'rallybutton',
            text: 'cancel',
            itemId: 'cancelBtn',
            id: 'cancelBtn',
            style: `z-index:19500;position:absolute;top:${Math.round(height / 2) + 50}px;left:${Math.round(width / 2) - 30}px;width:60px;height:25px;`,
            hidden,
            handler: this._cancelLoading
        });
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
                text: 'Export Top Level Portfolio Item...',
                handler: this._export,
                scope: this,
                currentModel
            }, {
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
        } else if (currentModel === 'defect') {
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
        } else if (currentModel === 'testcase') {
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

    _showError(msg, status) {
        if (status) {
            status.loadingFailed = true;
        }
        this._setLoading(false);
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
    _setLoading(message, target) {
        if (!message) {
            this.gridArea.down('#cancelBtn').hide();
        }
        if (target) {
            target.setLoading(message);
        } else {
            this.gridArea.setLoading(message);
        }
    },
    _getExportColumns() {
        let grid = this.down('rallygridboard').getGridOrBoard();
        if (grid) {
            return _.filter(grid.columns, item => (
                item.dataIndex &&
                item.dataIndex !== 'DragAndDropRank' &&
                item.xtype &&
                item.xtype !== 'rallytreerankdraghandlecolumn' &&
                item.xtype !== 'rallyrowactioncolumn' &&
                item.text !== '&#160;'));
        }
        return [];
    },
    async _getExportFilters(status) {
        let grid = this.down('rallygridboard');
        let filters = this.getSetting('query') ? [Rally.data.wsapi.Filter.fromQueryString(this.getSetting('query'))] : [];

        let timeboxScope = this.getContext().getTimeboxScope();
        if (timeboxScope && grid && timeboxScope.isApplicable(grid.getGridOrBoard().store.model)) {
            filters.push(timeboxScope.getQueryFilter());
        }

        let ancestorAndMultiFilters = await this.ancestorFilterPlugin.getAllFiltersForType(this.modelNames[0], true).catch((e) => {
            Rally.ui.notify.Notifier.showError({ message: (e.message || e) });
            status.loadingFailed = true;
        });

        if (ancestorAndMultiFilters) {
            filters = filters.concat(ancestorAndMultiFilters);
        }

        let additionalFilter = this.getSetting('additionalFilterField');

        if (additionalFilter) {
            let additionalFilterValue = this.down('#additionalFilterCombo').getValue();
            if (additionalFilterValue || typeof additionalFilterValue === 'string') {
                filters.push(new Rally.data.wsapi.Filter({
                    property: additionalFilter,
                    value: additionalFilterValue
                }));
            }
        }

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
    async _export(args) {
        this._setLoading('Getting filters for export...');
        this.gridArea.down('#cancelBtn').show();

        // This object helps us cancel a load that is waiting for filters to be returned
        let thisStatus = { loadingFailed: false, cancelLoad: false };
        this._cancelPreviousLoad(thisStatus);

        let columns = this._getExportColumns();
        let fetch = this._getExportFetch();
        let filters = await this._getExportFilters(thisStatus);

        if (thisStatus.loadingFailed) {
            this._showError('Error loading filters for export. Please try again.');
            return;
        }

        let modelName = this.modelNames[0];
        let childModels = args.childModels;
        let sorters = this._getExportSorters();

        this.logger.log('_export', fetch, args, columns, filters.toString(), childModels, sorters);

        // this._setLoading('Loading data for export...');

        let exporter = Ext.create('Rally.technicalservices.HierarchyExporter', {
            modelName,
            fileName: 'hierarchy-export.csv',
            columns,
            portfolioItemTypeObjects: this.portfolioItemTypes,
            singleLevel: !(childModels && childModels.length),
            status: thisStatus

        });
        exporter.on('exportupdate', this._setLoading, this);
        exporter.on('exporterror', this._showError, this);
        exporter.on('exportcomplete', this._onExportComplete, this);

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
            context: dataContext,
            enablePostGet: true,
            status: thisStatus
        });
        hierarchyLoader.on('statusupdate', this._setLoading, this);
        hierarchyLoader.on('hierarchyloadartifactsloaded', exporter.setRecords, exporter);
        hierarchyLoader.on('hierarchyloadcomplete', exporter.export, exporter);
        hierarchyLoader.on('hierarchyloaderror', this._showError, this);
        hierarchyLoader.load();
    },
    _onExportComplete(message) {
        this._setLoading(false);
        this._showStatus(message);
    },
    _cancelLoading: function () {
        let app = Rally.getApp();
        if (app.globalStatus) {
            app.globalStatus.cancelLoad = true;
        }
        var gridboardStore = Ext.getStore('gridboardStore');
        if (gridboardStore) {
            gridboardStore.cancelLoad();
        }
        app._setLoading(false);
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