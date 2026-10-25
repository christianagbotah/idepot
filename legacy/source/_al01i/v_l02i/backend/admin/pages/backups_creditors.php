
<!doctype html>
<html>
    <head>
        <title><?=$page_title; ?></title>
        <link rel="stylesheet" href="<?php echo base_url('assets/css/font-icons/entypo/css/entypo.css.min.css'); ?>"/>
        <link rel="stylesheet" href="http://fonts.googleapis.com/css?family=Noto+Sans:400,700,400italic"/>
        <link rel="shortcut icon" href="<?php echo base_url('uploads/school_logo.png');?>">

        <!-- <link rel="stylesheet" href="https://cdn.datatables.net/2.3.2/css/dataTables.dataTables.min.css">
        <link rel="stylesheet" href="https://cdn.datatables.net/autofill/2.7.0/css/autoFill.dataTables.min.css">
        <link rel="stylesheet" href="https://cdn.datatables.net/buttons/3.2.3/css/buttons.dataTables.min.css">

        <script src="<?php echo base_url('assets/js/jquery-3.4.1.js');?>" type="text/javascript"></script>
        <script src="<?php echo base_url('assets/js/jquery-ui/js/jquery-ui.js');?>"></script>
        <script src="https://cdn.datatables.net/2.3.2/js/dataTables.min.js"></script>
        <script src="https://cdn.datatables.net/autofill/2.7.0/js/dataTables.autoFill.min.js"></script>
        <script src="https://cdn.datatables.net/buttons/3.2.3/js/dataTables.buttons.min.js"></script>
        <script src="https://cdn.datatables.net/buttons/3.2.3/js/buttons.colVis.min.js"></script>
        <script src="https://cdn.datatables.net/buttons/3.2.3/js/buttons.html5.min.js"></script> 
        <script src="https://cdn.datatables.net/buttons/3.2.3/js/buttons.print.min.js"></script>
        -->

        <style type="text/css">
            @media Print{

                page[size="A4"] {
                    width: 21cm;
                    height: 29.7cm;
                    page-break-after: always;
                }

            }
        </style>


    </head>
    <body>  

        <div class="container">
            <div class="row">
                <div class="col-lg-12">
                    <page size="A4">
                        <?php
                            if($data == 'done') {

                                echo 'All creditors within the selected date have been reconciled successfully!';
                            } else {
                                ?>
                                <table class="table table-bordered table-striped" id="creditors" style="width:100%; border-collapse:collapse; margin-top: 10px;" border="1">
                            <thead>
                                <tr>
                                    <th>S/N</th>
                                    <th>NAME</th>
                                    <th>ORDER DATE</th>
                                    <th>SO CODE</th>
                                    <th>INVOICE CODE</th>
                                    <th>ITEM</th>
                                    <th>QUANTITY</th>
                                    <th>OLD VALUE</th>
                                    <th>CURRENT VALUE</th>
                                </tr>
                            </thead>
                            <tbody>
                                <?php
                                $sn = 1;
                                $total_old_value = 0;
                                $total_new_value = 0;
                                $total_quantity = 0;

                                foreach ($data as $value) {
                                    
                                    $customer_name = $this->crud_model->getCustomerDetails($value['customer_id'], 'customer_name');
                                    $item_name = $this->crud_model->getItemName($value['item_id']);
                                    $order_date = $value['date'];
                                    $so_code = $value['so_code'];
                                    $quantity_due = $value['quantity_due'];
                                    $old_price = $value['price'];
                                    $current_price = $this->crud_model->getItemSellingPriceById($value['item_id']);
                                    $invoice_code = $this->crud_model->getInvoiceCodeBySoCode($so_code);
                                    $old_value = $old_price * $quantity_due;
                                    $new_value = $current_price * $quantity_due;

                                    /*Summation*/
                                    $total_old_value += $old_value;
                                    $total_new_value += $new_value;
                                    $total_quantity += $quantity_due;

                                    ?>
                                    <tr>
                                        <td><?=$sn;?></td>
                                        <td><?=$customer_name;?></td>
                                        <td><?=$order_date;?></td>
                                        <td><?=$so_code;?></td>
                                        <td><?=$invoice_code;?></td>
                                        <td><?=$item_name;?></td>
                                        <td align="right"><?=number_format($quantity_due, 0, '.', ',');?></td>
                                        <td align="right"><?='('.$old_price.'x'.$quantity_due.')  =  <strong>'. number_format($old_value, 2, '.', ',');?></strong></td>
                                        <td align="right"><?='('.$current_price.'x'.$quantity_due.')  =  <strong>'. number_format($new_value, 2, '.', ',');?></strong></td>
                                    </tr>

                                    <?php

                                    $sn++;
                                }


                                ?>
                                <tr>
                                    <td colspan="6" align="right"><strong>TOTAL</strong></td>
                                    <td align="right"><?=number_format($total_quantity, 0, '.', ',');?></td>
                                    <td align="right"><?=number_format($total_old_value, 2, '.', ',');?></td>
                                    <td align="right"><?=number_format($total_new_value, 2, '.', ',');?></td>

                                </tr>
                            </tbody>
                        </table>
                                <?php
                            }
                        ?>
                    </page>
                </div>
            </div>
        </div>
    </body>

    <script type="text/javascript">

        /*$('#creditors').DataTable( {
            buttons: [
                'copy', 'excel', 'pdf'
            ]
        } );*/
        
        function showLoader() {

            showAjaxModal_confirm('<h3 style="color: black">Please Wait...<i class="fa fa-spinner fa-pulse"></i></h3><h4 style="color: black">Loading your data</h4>"></i>', 'Loading');

        }
    </script>
    </html>
