function setup_queries(frm) {
  frm.set_query('cost_center', function ({ company }) {
    return { filters: { company, is_group: 0 } };
  });
  frm.set_query('party_type', function () {
    return {
      filters: {
        name: ['in', Object.keys(frappe.boot.party_account_types)],
      },
    };
  });
  frm.set_query('account', 'items', function ({ company }) {
    return { filters: { company, root_type: ['in', ['Income', 'Expense']] } };
  });
  frm.set_query('template_type', 'items', function () {
    return {
      filters: {
        name: [
          'in',
          [
            'Sales Taxes and Charges Template',
            'Purchase Taxes and Charges Template',
          ],
        ],
      },
    };
  });
}

async function set_calculated_fields(frm, cdt, cdn) {
  const { net_amount = 0, tax_amount = 0 } = frappe.get_doc(cdt, cdn);
  await frappe.model.set_value(
    cdt,
    cdn,
    'total_amount',
    net_amount + tax_amount
  );
  await Promise.all(
    ['net_amount', 'tax_amount', 'total_amount'].map((field) =>
      frm.set_value(
        field,
        frm.doc.items.reduce((a, x) => a + (x[field] || 0), 0)
      )
    )
  );
  frm.refresh();
}

function set_template_type(payment_type, cdt, cdn) {
  function get_type() {
    if (payment_type === 'Incoming') {
      return 'Sales Taxes and Charges Template';
    }
    if (payment_type === 'Outgoing') {
      return 'Purchase Taxes and Charges Template';
    }
    return null;
  }
  frappe.model.set_value(cdt, cdn, 'template_type', get_type());
}

function set_tax_amount(frm, cdt, cdn) {
  const { net_amount = 0, rate = 0 } = frappe.get_doc(cdt, cdn);
  return frappe.model.set_value(
    cdt,
    cdn,
    'tax_amount',
    (net_amount * rate) / 100
  );
}

const gl_payment_item = {
  items_add: function (frm, cdt, cdn) {
    const { payment_type } = frm.doc;
    set_template_type(payment_type, cdt, cdn);
  },
  template_type: function (frm, cdt, cdn) {
    frappe.model.set_value(cdt, cdn, 'tax_template', null);
  },
  tax_template: async function (frm, cdt, cdn) {
    function set_fields(values = {}) {
      ['rate', 'account_head'].forEach((field) => {
        frappe.model.set_value(cdt, cdn, field, values[field] || null);
      });
    }
    const { company } = frm.doc;
    if (!company) {
      frappe.throw(__('Please set Company first'));
    }
    const { template_type, tax_template } = frappe.get_doc(cdt, cdn);
    if (tax_template) {
      const { message: { rate, account_head } = {} } = await frappe.call({
        method: 'pos_bahrain.api.gl_payment.get_tax',
        args: { company, template_type, tax_template },
      });
      set_fields({ rate, account_head });
    } else {
      set_fields();
    }
  },
  net_amount: async function (frm, cdt, cdn) {
    await set_tax_amount(frm, cdt, cdn);
    set_calculated_fields(frm, cdt, cdn);
  },
  rate: set_tax_amount,
  tax_amount: set_calculated_fields,
};

export default function () {
  return {
    gl_payment_item,
    setup: setup_queries,
    payment_type: function (frm) {
      function get_party_type(payment_type) {
        if (payment_type === 'Incoming') {
          return 'Customer';
        }
        if (payment_type === 'Outgoing') {
          return 'Supplier';
        }
        return null;
      }
      const { payment_type, items = [] } = frm.doc;
      items.forEach(({ doctype: cdt, name: cdn }) =>
        set_template_type(payment_type, cdt, cdn)
      );
      frm.set_value({ party_type: get_party_type(payment_type) });
    },
    party: async function (frm) {
      const { party_type, party } = frm.doc;
      if (party_type && party) {
        const party_name_field = `${party_type.toLowerCase()}_name`;
        const { message: doc = {} } = await frappe.db.get_value(
          party_type,
          party,
          party_name_field
        );
        frm.set_value('party_name', doc[party_name_field]);
      } else {
        frm.set_value('party_name', null);
      }
    },
  };
}
