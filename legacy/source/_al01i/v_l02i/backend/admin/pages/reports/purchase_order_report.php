<!doctype html>
<html>
<head>
    <title><?=$page_title ?? 'Purchase Order Report'; ?></title>
    <link rel="stylesheet" href="<?php echo base_url('assets/css/font-icons/entypo/css/entypo.css.min.css'); ?>"/>
    <link rel="stylesheet" href="http://fonts.googleapis.com/css?family=Noto+Sans:400,700,400italic"/>
    <link rel="shortcut icon" href="<?php echo base_url('uploads/school_logo.png');?>">
    <script src="<?php echo base_url('assets/js/jquery-3.3.1.min.js');?>"></script>
</head>
<body>
    <div class="container">
        <div class="row" style="margin-top: 15px; position: fixed; right: 5px; z-index: 9999" id="print_div">
            <a href="javascript:void(0);" onClick="print_page()">Print Purchase Order List</a>
        </div>
        <div class="row">
            <div class="col-lg-12">
                <div id="print">
                    <?php
                    // BATCH LOAD SETTINGS
                    $settings_types = ['currency', 'system_name', 'address', 'phone', 'po_prefix'];
                    $this->db->where_in('type', $settings_types);
                    $settings_query = $this->db->get('settings');
                    $settings = [];
                    foreach($settings_query->result_array() as $row) {
                        $settings[$row['type']] = $row['description'];
                    }
                    $currency = $settings['currency'] ?? 'USD';
                    $system_name = $settings['system_name'] ?? 'System';
                    $address = $settings['address'] ?? '';
                    $phone = $settings['phone'] ?? '';
                    $fmt = new NumberFormatter('en_US', NumberFormatter::CURRENCY);
                    
                    $from = $from ?? 0;
                    $to = $to ?? 0;
                    $supplier_id = $supplier_id ?? 0;
                    $item_id = $item_id ?? 'All';

                    // Handle date range
                    if($from == 0 && $to == 0) {
                        $this->db->select('date_timestamp');
                        $this->db->from('purchase_order');
                        $this->db->order_by('date_timestamp', 'asc');
                        $this->db->limit(1);
                        $first = $this->db->get()->row();
                        $from = $first ? date('d-m-Y', $first->date_timestamp) : date('d-m-Y');
                        $to = date('d-m-Y');
                    }

                    $from_ts = strtotime($from);
                    $to_ts = strtotime($to);

                    // BATCH LOAD PURCHASE ORDERS
                    if($supplier_id != 0) $this->db->where('supplier_id', $supplier_id);
                    if($item_id != 'All') $this->db->where('item_id', $item_id);
                    $this->db->where('date_timestamp >=', $from_ts);
                    $this->db->where('date_timestamp <=', $to_ts);
                    $this->db->select('po_code, date, supplier_id, SUM(quantity) as total_qty, SUM(amount) as total_amount, MAX(amount_due) as amount_due, MAX(price) as price');
                    $this->db->group_by('po_code');
                    $orders = $this->db->get('purchase_order')->result_array();

                    // BATCH LOAD SUPPLIERS
                    $supplier_ids = array_unique(array_column($orders, 'supplier_id'));
                    $suppliers_map = [];
                    if(!empty($supplier_ids)) {
                        $this->db->where_in('supplier_id', $supplier_ids);
                        foreach($this->db->get('suppliers')->result_array() as $sup) {
                            $suppliers_map[$sup['supplier_id']] = $sup['supplier_name'];
                        }
                    }

                    // BATCH LOAD ITEMS FOR SUMMARY
                    if($supplier_id != 0) $this->db->where('supplier_id', $supplier_id);
                    if($item_id != 'All') $this->db->where('item_id', $item_id);
                    $this->db->where('date_timestamp >=', $from_ts);
                    $this->db->where('date_timestamp <=', $to_ts);
                    $this->db->select('item_id, supplier_id, SUM(quantity) as total_qty');
                    $this->db->group_by('item_id, supplier_id');
                    $item_summary = $this->db->get('purchase_order')->result_array();

                    // BATCH LOAD ITEM NAMES AND CURRENT STOCK
                    $item_ids = array_unique(array_column($item_summary, 'item_id'));
                    $items_map = [];
                    if(!empty($item_ids)) {
                        $this->db->where_in('item_id', $item_ids);
                        foreach($this->db->get('items')->result_array() as $item) {
                            $items_map[$item['item_id']] = [
                                'name' => $item['item_name'],
                                'quantity' => $item['quantity']
                            ];
                        }
                    }

                    $grand_quantity = array_sum(array_column($orders, 'total_qty'));
                    $grand_amount = array_sum(array_column($orders, 'total_amount'));
                    $grand_due = array_sum(array_column($orders, 'amount_due'));
                    $order_counter = count($orders);
                    ?>

                    <style>
                        body { font-size: 14px; font-family: 'Noto Sans', Arial, sans-serif; }
                        .po-container { max-width: 1200px; margin: 0 auto; padding: 20px; }
                        .po-header { text-align: center; margin-bottom: 30px; border-bottom: 3px solid #1b1b69; padding-bottom: 15px; }
                        .po-header h2 { margin: 5px 0; font-size: 22px; letter-spacing: 2px; }
                        .po-header p { margin: 3px 0; color: #666; }
                        .po-table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                        .po-table thead { background: #4242ad; color: white; }
                        .po-table th { padding: 12px 8px; text-align: left; font-weight: bold; }
                        .po-table td { padding: 8px; border-bottom: 1px solid #e0e0e0; }
                        .po-total { font-weight: bold; background: #e8f4f8; border-top: 3px double #1b1b69 !important; }
                        .po-amount { text-align: right; font-family: monospace; }
                        #print_div a { background: #1b1b69; color: white; padding: 8px 16px; border-radius: 5px; text-decoration: none; font-weight: bold; }
                        #print_div a:hover { background: #2c3e50; }
                        @media print {
                            #print_div { display: none; }
                            body { margin: 0; }
                            .po-container { max-width: 100%; }
                        }
                    </style>

                    <div class="po-container">
                        <div class="po-header">
                            <img src="<?php echo base_url('uploads/school_logo.png'); ?>" style="max-height: 80px;">
                            <h2><?php echo strtoupper($system_name); ?></h2>
                            <p><?php echo $address; ?> | <?php echo $phone; ?></p>
                            <h2 style="margin-top: 20px;">PURCHASE ORDER REPORT</h2>
                            <p><strong>Period: <?php echo $from; ?> to <?php echo $to; ?></strong></p>
                            <p>Order Count: <strong><?php echo number_format($order_counter, 0); ?></strong></p>
                        </div>

                        <table class="po-table">
                            <thead>
                                <tr>
                                    <th style="width: 12%;">Date</th>
                                    <th style="width: 18%;">Order</th>
                                    <th style="width: 25%;">Supplier</th>
                                    <th style="width: 12%;" class="po-amount">Quantity</th>
                                    <th style="width: 13%;" class="po-amount">Unit Price</th>
                                    <th style="width: 10%;" class="po-amount">Amount</th>
                                    <th style="width: 10%;" class="po-amount">Due</th>
                                </tr>
                            </thead>
                            <tbody>
                                <?php foreach($orders as $order): ?>
                                <tr>
                                    <td><?php echo $order['date'] ?? ''; ?></td>
                                    <td><?php echo $order['po_code'] ?? ''; ?></td>
                                    <td><?php echo $suppliers_map[$order['supplier_id'] ?? 0] ?? 'Unknown'; ?></td>
                                    <td class="po-amount"><?php echo number_format($order['total_qty'] ?? 0, 0); ?></td>
                                    <td class="po-amount"><?php echo number_format($order['price'] ?? 0, 2); ?></td>
                                    <td class="po-amount"><?php echo number_format($order['total_amount'] ?? 0, 2); ?></td>
                                    <td class="po-amount"><?php echo number_format($order['amount_due'] ?? 0, 2); ?></td>
                                </tr>
                                <?php endforeach; ?>
                                <tr class="po-total">
                                    <td colspan="3">TOTAL</td>
                                    <td class="po-amount"><?php echo number_format($grand_quantity, 0); ?></td>
                                    <td></td>
                                    <td class="po-amount"><?php echo numfmt_format_currency($fmt, $grand_amount, $currency); ?></td>
                                    <td class="po-amount"><?php echo numfmt_format_currency($fmt, $grand_due, $currency); ?></td>
                                </tr>
                            </tbody>
                        </table>

                        <h3 style="margin-top: 40px; border-bottom: 2px solid #1b1b69; padding-bottom: 10px;">ORDER SUMMARY</h3>
                        <table class="po-table">
                            <thead style="background: #cecece; color: #333;">
                                <tr>
                                    <th style="width: 40%;">Item</th>
                                    <th style="width: 30%;">Supplier</th>
                                    <th style="width: 15%;" class="po-amount">In Stock</th>
                                    <th style="width: 15%;" class="po-amount">Ordered</th>
                                </tr>
                            </thead>
                            <tbody>
                                <?php 
                                $total_ordered = 0;
                                $total_stock = 0;
                                foreach($item_summary as $item): 
                                    $item_info = $items_map[$item['item_id'] ?? 0] ?? ['name' => 'Unknown', 'quantity' => 0];
                                    $total_ordered += $item['total_qty'] ?? 0;
                                    $total_stock += $item_info['quantity'] ?? 0;
                                ?>
                                <tr>
                                    <td><?php echo $item_info['name'] ?? 'Unknown'; ?></td>
                                    <td><?php echo $suppliers_map[$item['supplier_id'] ?? 0] ?? 'Unknown'; ?></td>
                                    <td class="po-amount"><?php echo number_format($item_info['quantity'] ?? 0, 0); ?></td>
                                    <td class="po-amount"><?php echo number_format($item['total_qty'] ?? 0, 0); ?></td>
                                </tr>
                                <?php endforeach; ?>
                                <tr class="po-total">
                                    <td colspan="2">TOTAL</td>
                                    <td class="po-amount"><?php echo number_format($total_stock, 0); ?></td>
                                    <td class="po-amount"><?php echo number_format($total_ordered, 0); ?></td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script>
        function print_page() {
            window.print();
        }

        $(function() {
            setTimeout(() => {
                print_page();
            }, 1000);
        });
    </script>
</body>
</html>
