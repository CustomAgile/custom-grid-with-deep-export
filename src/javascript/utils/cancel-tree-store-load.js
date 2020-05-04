/**
 * Overrides to allow a store load to the canceled which will abort loading
 * any subsequent pages and not invoke the load callback.
 */
Ext.override(Rally.data.wsapi.TreeStore, {

    loadCanceled: false,

    cancelLoad: function () {
        this.loadCanceled = true;
    },

    load: function (options) {
        this.loadCanceled = false;
        this.callParent(arguments);
    },

    onProxyLoad: function (operation) {
        if (this.loadCanceled) {
            this.loadCanceled = false;
            return;
        }

        if (operation.error && operation.error.errors && operation.error.errors.length > 0) {
            this._hasErrors = true;
            this.fireEvent('error', operation.error.errors);
            return;
        }

        this.callParent(arguments);
    }
});
