(function () {
    var Ext = window.Ext4 || window.Ext;

    var getHiddenFieldConfig = function (name) {
        return {
            name: name,
            xtype: 'rallytextfield',
            hidden: true,
            handlesEvents: {
                typeselected: function (type) {
                    this.setValue(null);
                }
            }
        };
    };

    Ext.define('Rally.technicalservices.CustomGridWithDeepExportSettings', {
        singleton: true,
        requires: [
            'Rally.ui.combobox.FieldComboBox',
            'Rally.ui.combobox.ComboBox',
            'Rally.ui.CheckboxField'
        ],

        getFields: function () {

            return [{
                name: 'type',
                xtype: 'rallycombobox',
                width: 350,
                allowBlank: false,
                autoSelect: false,
                shouldRespondToScopeChange: true,
                initialValue: 'HierarchicalRequirement',
                storeConfig: {
                    model: Ext.identityFn('TypeDefinition'),
                    context: { project: null },
                    sorters: [{ property: 'DisplayName' }],
                    fetch: ['DisplayName', 'ElementName', 'TypePath', 'Parent', 'UserListable'],
                    filters: [{ property: 'UserListable', value: true }],
                    autoLoad: false,
                    remoteSort: false,
                    remoteFilter: true
                },
                displayField: 'DisplayName',
                valueField: 'TypePath',
                listeners: {
                    select: function (combo) {
                        combo.fireEvent('typeselected', combo.getRecord().get('TypePath'), combo.context);
                    },
                    ready: function (combo) {
                        combo.fireEvent('typeselected', combo.getRecord().get('TypePath'), combo.context);
                    }
                },
                bubbleEvents: ['typeselected'],
                readyEvent: 'ready',
                handlesEvents: {
                    projectscopechanged: function (context) {
                        this.refreshWithNewContext(context);
                    }
                }
            },
            { type: 'query' },
            {
                name: 'showControls',
                xtype: 'rallycheckboxfield',
                fieldLabel: 'Show Control Bar'
            },
            {
                name: 'enableUrlSharing',
                xtype: 'rallycheckboxfield',
                fieldLabel: 'Enable URL Sharing of Saved Views'
            },
            {
                name: 'additionalFilterField',
                xtype: 'rallyfieldcombobox',
                plugins: ['rallyfieldvalidationui'],
                fieldLabel: 'Additional Filter Dropdown',
                readyEvent: 'ready',
                allowBlank: false,
                allowNoEntry: true,
                noEntryText: '-- None --',
                validateOnChange: false,
                validateOnBlur: false,
                width: 350,
                bubbleEvents: ['fieldselected'],
                handlesEvents: {
                    typeselected: function (models, context) {
                        var type = Ext.Array.from(models)[0];
                        if (type) {
                            try {
                                this.refreshWithNewModelType(type, context);
                            }
                            catch (e) {
                                this.store.removeAll();
                                this.reset();
                            }
                        }
                        else {
                            this.store.removeAll();
                            this.reset();
                        }
                    }
                },
                // bubbleEvents: ['fieldselected'],
                listeners: {
                    change: function (combo) {
                        if (combo.getRecord()) {
                            combo.fireEvent('fieldselected', combo.getDisplayValue());
                        }
                    },
                    ready: function (combo) {
                        combo.store.filterBy(function (record) {
                            var field = record.get('fieldDefinition'),
                                attr = field.attributeDefinition,
                                whiteList = ['c_EnterpriseApprovalEA', 'c_EAEpic'];
                            // console.log(field.name, field ? field.isConstrained() : '');
                            return record.get('name') === '-- None --' || (attr && field.isConstrained() && field.hasAllowedValues() && (!attr.Hidden || _.contains(whiteList, field.name)) && (((attr.AttributeType !== 'COLLECTION' && !field.isMultiValueCustom()) &&
                                !field.isMappedFromArtifact) || _.contains(whiteList, field.name)));
                        });
                        var fields = Ext.Array.map(combo.store.getRange(), function (record) {
                            return record.get(combo.getValueField());
                        });

                        if (combo.getDisplayValue() !== '-- None --' && !Ext.Array.contains(fields, combo.getValue())) {
                            combo.setValue(fields[0]);
                        }
                    }
                }
            },
            getHiddenFieldConfig('columnNames'),
            getHiddenFieldConfig('order'),
            {
                name: 'additionalFilterLabel',
                xtype: 'rallytextfield',
                hidden: true,
                handlesEvents: {
                    fieldselected: function (fieldName) {
                        this.setValue(fieldName);
                    }
                }
            }
            ];
        }
    });
})();
