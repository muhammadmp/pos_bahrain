// Copyright (c) 2020, 	9t9it and contributors
// For license information, please see license.txt

frappe.ui.form.off('Stock Entry', 'scan_barcode');
frappe.ui.form.on(
  'Stock Entry',
  'scan_barcode',
  pos_bahrain.scripts.extensions.scan_barcode
);
