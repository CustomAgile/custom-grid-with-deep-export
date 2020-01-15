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

    onProxyLoad: function () {
        if (this.loadCanceled) {
            this.loadCanceled = false;
            return;
        }
        this.callParent(arguments);
    }
});
