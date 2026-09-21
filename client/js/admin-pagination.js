/**
 * Backward-compatible loader — implementation lives in admin/modules/pagination-util.js
 */
if (typeof AdminPagination === 'undefined') {
  console.warn('AdminPagination: load /js/admin/modules/pagination-util.js before admin-pagination.js');
}
