// If the server returns a 413 error, the error text is empty
// Overriding it so we can show something that's actually helpful
Ext.override(Rally.ui.notify.Notifier, {
    showError: function (config) {
        if (config && typeof config.message === 'string' && !config.message) {
            return;
        }
        this.callParent(arguments);
    }
});

Ext.override(Rally.ui.dialog.SharedViewDialog, {
    /* 
        Dialog and Combobox weren't refreshing after adding a new shared
        view, so here we are 
    */
    _onCreate: function (dialog, record) {
        if (this.grid) {
            this.grid.getStore().reload();
        }
        let newPrefRef = record.get('_ref');
        let combobox = Rally.getApp().down('#sharedViewCombo');

        if (newPrefRef && combobox) {
            combobox.getStore().reload();
            combobox.setValue(newPrefRef);
            combobox.saveState();
        }

        this.down('#doneButton').focus();
    },
});

Ext.override(Rally.ui.gridboard.GridBoard, {
    getCurrentView: function () {
        let views = [];
        let ancestorPlugin = Rally.getApp().ancestorFilterPlugin;

        if (ancestorPlugin) {
            views = Ext.apply(this.callParent(arguments), ancestorPlugin.getCurrentView());
        }
        else {
            views = this.callParent(arguments);
        }

        return views;
    },
    setCurrentView: function (view) {
        var app = Rally.getApp();
        app.down('#grid-area').setLoading('Loading View...');
        // Ext.suspendLayouts();
        app.settingView = true;

        if (app.ancestorFilterPlugin) {
            if (view.filterStates) {
                app.ancestorFilterPlugin.mergeLegacyFilter(view.filterStates, view, app.modelNames[0]);
            }
            app.ancestorFilterPlugin.setCurrentView(view);
        }

        this.callParent(arguments);

        setTimeout(async function () {
            // Ext.resumeLayouts(true);
            app.settingView = false;
            app._buildStore();
        }.bind(this), 500);
    }
});

// Remove 'Actuals' from the blacklist
Ext.override(Rally.ui.gridboard.plugin.GridBoardFieldPicker, {
    gridFieldBlackList: [
        // 'Actuals',
        'Changesets',
        'Children',
        // 'Description',
        // 'Notes',
        'ObjectID',
        'Predecessors',
        'RevisionHistory',
        'Subscription',
        'Successors',
        'TaskIndex',
        'Workspace',
        'VersionId'
    ]
});

Ext.override(Rally.ui.grid.TreeGrid, {
    // Override needed to allow summaryType to be restored when a column with
    // summaryType config is added by the field picker
    _mergeColumnConfigs: function (newColumns, oldColumns) {
        return _.map(newColumns, function (newColumn) {
            // If the newly selected column is currently in oldColumns (this.columns), then
            // use the in-use column config to preserve its current settings
            var result = newColumn;
            var newColumnName = this._getColumnName(newColumn);
            var oldColumn = _.find(oldColumns, { dataIndex: newColumnName });
            if (oldColumn) {
                result = this._getColumnConfigFromColumn(oldColumn);
            }
            else if (this.config && this.config.columnCfgs) {
                // Otherwise, if the newly selected column appears in the original columnCfgs
                // use that config. (This allows the column picker to get any renderers or summary
                // config from the column config)
                var columnCfg = _.find(this.config.columnCfgs, { dataIndex: newColumnName });
                if (columnCfg) {
                    result = columnCfg;
                }
            }

            return result;
        }, this);
    },

    // Override needed to allow summaryType to be included when a column is restored
    // from state.
    _applyStatefulColumns: function (columns) {
        // TODO (tj) test default columns
        if (this.alwaysShowDefaultColumns) {
            _.each(this.columnCfgs, function (columnCfg) {
                if (!_.any(columns, { dataIndex: this._getColumnName(columnCfg) })) {
                    columns.push(columnCfg);
                }
            }, this);
        }

        if (this.config && this.config.columnCfgs) {
            // Merge the column config with the stateful column if the dataIndex is the same.
            // This allows use to pick up summaryType and custom renderers
            _.each(this.config.columnCfgs, function (columnCfg) {
                // Search by dataIndex or text
                var columnName = this._getColumnName(columnCfg);
                var columnState = _.find(columns, function (value) {
                    return (value.dataIndex === columnName || value.text === columnName);
                });
                if (columnState) {
                    // merge them (add renderer)
                    _.merge(columnState, columnCfg);
                }
            }, this);
        }

        this.columnCfgs = columns;
    }
});

// We filter the list ourselves in the settings so we can include whitelisted fields
Ext.override(Rally.ui.combobox.FieldComboBox, {
    _isNotHidden: function () {
        return true;
    },
});