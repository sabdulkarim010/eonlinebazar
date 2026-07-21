/**
 * Low-stock and out-of-stock badge helpers for cart and wishlist views.
 */
(function (global) {
    function findCatalogProduct(catalog, productId) {
        if (!Array.isArray(catalog) || !productId) return null;
        return catalog.find(p =>
            String(p._id) === String(productId) ||
            String(p.productId) === String(productId) ||
            String(p.id) === String(productId)
        ) || null;
    }

    function resolveVariantStock(realProduct, item) {
        if (!item || !item.variantId || !Array.isArray(realProduct?.variants)) return null;
        const matched = realProduct.variants.find(v =>
            (v.sku && v.sku === item.variantSku) ||
            (`${v.attribute}::${v.value}` === item.variantId) ||
            (v.value === item.variantValue && v.attribute === item.variantAttribute)
        );
        return matched != null ? Number(matched.stock ?? 0) : null;
    }

    function getItemStock(item, realProduct) {
        if (!realProduct) return null;
        const variantStock = resolveVariantStock(realProduct, item);
        if (variantStock !== null) return variantStock;
        return Number(realProduct.stock ?? realProduct.quantity ?? 0);
    }

    function buildStockAlertHtml(stock) {
        if (stock === null || stock === undefined || Number.isNaN(Number(stock))) return '';
        const n = Number(stock);
        if (n <= 0) {
            return '<span class="stock-alert-badge stock-out">Out of Stock</span>';
        }
        if (n <= 3) {
            return `<span class="stock-alert-badge stock-low">🔥 Only ${n} left in stock - order soon!</span>`;
        }
        return '';
    }

    function isOutOfStock(stock) {
        return stock !== null && stock !== undefined && Number(stock) <= 0;
    }

    function isIncreaseDisabled(stock, quantity) {
        if (stock === null || stock === undefined) return false;
        return Number(stock) <= 0 || Number(quantity || 1) >= Number(stock);
    }

    global.StockAlert = {
        findCatalogProduct,
        getItemStock,
        buildStockAlertHtml,
        isOutOfStock,
        isIncreaseDisabled
    };
})(window);
