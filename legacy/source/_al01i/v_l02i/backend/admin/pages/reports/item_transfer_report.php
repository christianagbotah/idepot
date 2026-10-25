
<!doctype html>
<html>
    <head>
        <title><?=$page_title;?></title>
        <link rel="stylesheet" href="<?php echo base_url('assets/css/font-icons/entypo/css/entypo.css.min.css'); ?>"/>
        <link rel="stylesheet" href="http://fonts.googleapis.com/css?family=Noto+Sans:400,700,400italic"/>
        <link rel="stylesheet" type="text/css" href="<?php echo base_url('assets/css/chartjs/dist/Chart.min.css'); ?>"/>
        <link rel="shortcut icon" href="<?php echo base_url('uploads/school_logo.png'); ?>">
        <!--Chartjs-->
        <script src="<?php echo base_url('assets/css/chartjs/dist/Chart.min.js'); ?>" type="text/javascript"></script>

    </head>
    <body>

        <div class="container">
            <div class="row" style="margin-top: 15px; position: fixed; right: 5px; z-index: 9999" id="print_div">
                <a href="javascript:void(0);" onClick="print_page()">Print Item Transfer Report</a>
            </div>
            <div class="row">
                <div class="col-lg-12">
                    <div id="print">
                        <?php
//Account section
$currency = $this->db->get_where('settings', array('type' => 'currency'))->row()->description;
$fmt = new NumberFormatter('en_US', NumberFormatter::CURRENCY);

$system_name = $this->db->get_where('settings', array('type' => 'system_name'))->row()->description;
$location = $this->db->get_where('settings', array('type' => 'location'))->row()->description;
$address = $this->db->get_where('settings', array('type' => 'address'))->row()->description;
$phone = $this->db->get_where('settings', array('type' => 'phone'))->row()->description;

//get all the accounts names
$this->db->select('name');
$this->db->distinct();
$this->db->order_by('name', 'asc');
$account_names_query = $this->db->get('accounts');
$account_names = $account_names_query->result_array();

if ($from == 0 && $to == 0) {
	$this->db->select('date_timestamp');
	$this->db->from('payment_with_goods');
	$this->db->order_by('date_timestamp', 'asc');
	$this->db->limit(1);
	$from = date('d-m-Y', $this->db->get()->row()->date_timestamp); //

	$to = date('d-m-Y');
}

?>



                        <link rel="stylesheet" type="text/css" href="<?php echo base_url('assets/css/chartjs/dist/Chart.min.css'); ?>"/>
                        <!--Chartjs-->
                        <script src="<?php echo base_url('assets/css/chartjs/dist/Chart.min.js'); ?>" type="text/javascript"></script>
                        <script src="<?php echo base_url('assets/js/jquery-3.3.1.min.js'); ?>"></script>

                        <style type="text/css">

                             #mark_print th, #grade_table th, #conducts th {
                                /*background-color: grey;*/
                                padding: 5px;
                                color: #000000;
                                border-bottom: 2px solid #e2dddd;
                             }


                              #item_transfer_list thead {
                                padding: 10px 0px !important;
                              }

                             pre {
                                    display: block;
                                    font-family: monospace;
                                    white-space: pre-wrap;
                                    margin: -40px 0px;
                                    line-height: 20px;
                                }

                             body {
                                font-size: 14px !important;
                             }

                             .account_tb th {
                                background-color: grey;
                                border: 1px solid #e2dddd;
                                padding: 5px;
                                color: white;
                                border-bottom: 1px solid red;
                                text-align: left;
                             }

                            td {
                                padding: 5px;
                            }

                            #grade_table tbody tr td{
                                line-height: 25px;
                            }

                            #term{
                                background-color: black;
                                padding: 5px 15px 5px 15px;
                                border-radius: 9px;
                                font-size: 24px;
                                letter-spacing: 5px;
                                color: #ffffff;

                            }

                            div .logo{
                                position: absolute;
                                margin-top: 20px;
                                left: 10px;
                            }

                            div .photo_passport {
                                position: absolute;
                                margin-top: -100px;
                                right: 10px;
                                border-radius: 16% 6%;
                            }

                            page[size="A4"] {
                                    width: 21cm;
                                    height: 29.7cm;
                                    page-break-after: always;
                                }

                                #print_div a {
                                background-color: black;
                                color: #fff;
                                padding: 5px;
                                border-radius: 14px;
                                font-size: 15px;
                                font-weight: bold;
                            }

                            #print_div a:hover {
                                background-color: green;
                                color: #fff;
                            }

                            .footer {
                                    position: fixed;
                                    bottom: 0px;
                                }

                            #promote{
                                position: absolute;
                                    margin-top: -32px;
                                }

                            .footer {
                                    position: relative;
                                    bottom: 0px;
                                }
                            #status {
                                position: relative;
                                margin-top: -120px;
                                transform: rotate(-45deg);
                            }

                            @media Print{

                                .footer {
                                    position: fixed;
                                    bottom: 0px;
                                }
                                page {
                                background: #ffffff;
                                display: block;
                                margin: 0 auto;
                                margin-bottom: 0.5cm;
                                box-shadow: 0;

                                }

                                #order_summary {
                                    width: 100% !important;
                                }

                                 #item_transfer_list, #hr_line, #top_row, .footer {
                                    width: 130% !important;
                                }

                                pre {
                                    display: block;
                                    font-family: monospace;
                                    white-space: pre-wrap;
                                    margin: -40px 0px;
                                    line-height: 20px;
                                }

                                page[size="A4"] {
                                    width: 21cm;
                                    height: 29.7cm;
                                    page-break-after: always;
                                }

                                body, page {
                                    margin: 0;
                                    box-shadow: 0;
                                }

                                #print_div {
                                    display: none;
                                }


                                div .logo{
                                    position: absolute;
                                    margin-top: 20px;
                                    left: 10px;
                                }

                                div .photo_passport{
                                    position: absolute;
                                    margin-top: -75px !important;
                                    right: 10px;

                                }

                                #top_row{
                                    margin-top: -15px;
                                }

                                #student_details p{
                                    line-height: 30px;
                                }

                                #promote{
                                    margin-top: -32px;
                                }

                                #box{
                                    margin-top: -10px;
                                }

                                #gh{
                                    margin-top: -15px;
                                }

                                .sign {
                                    position: fixed;
                                    bottom: 5px;
                                }
                            }
                        </style>
                    <page size="A4">
                        <center>

                            <table class="table table-bordered table-striped" id="top_row" style="width:100%; border-collapse:collapse; margin-top: 10px;">
                                <thead>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td width="50%">
                                           <table class="table table-bordered table-striped" style="margin-top: -10px; border-collapse:collapse;">
                                                <thead>
                                                    <tr>
                                                    <td>
                                                       <img class="" src="<?php echo base_url(); ?>uploads/school_logo.png" style="max-height : 100px;">
                                                    </td>
                                                    <td>
                                                        <h3 style="font-weight: bold; font-size: 20px; letter-spacing: 2px;"><?php echo $system_name; ?></h3>
                                                        <pre>
                                                            <h4 style="font-family: Nunito" align='left'><?php echo trim($address); ?></h4>
                                                        </pre>
                                                    </td>
                                                    </tr>
                                                    <tr style="border-top: 2px solid #1b1b69;">
                                                        <td colspan="2"></td>
                                                    </tr>
                                                </thead>
                                            </table>
                                        </td>


                                        <td width="50%">
                                            <table class="table table-bordered table-striped" style="width: 100%; margin-top: -65px; border-collapse:collapse;">
                                                <thead>
                                                    <tr>
                                                        <td align="right" colspan="2"><h1 style="font-weight: bold; font-size: 20px; letter-spacing: 2px;">ITEM TRANSFER REPORT</h1></td>
                                                    </tr>
                                                    <tr>
                                                        <td align="right">Period: </td>
                                                        <td align="right"><strong>From: <?=$from;?> To: <?=$to;?></strong></td>
                                                    </tr>
                                                    
                                                  
                                                    
                                                    
                                                    <tr>

                                                    <tr>

                                                    <tr style="border-top: 2px solid #1b1b69;">
                                                        <td colspan="2"></td>
                                                    </tr>
                                                </thead>
                                            </table>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </center>



                        <div class="row">
                            <div class="col-lg-12 col-md-12">

                                <?php
//currency
$currency = $this->db->get_where('settings', array('type' => 'currency'))->row()->description;
$fmt = new NumberFormatter('en_US', NumberFormatter::CURRENCY);

$transfer_array = array();

$search_by_receivers = str_replace('-', ' ', $search_by_receivers);
$search_by_receivers = str_replace('_', '/', $search_by_receivers);
$search_by_receivers = str_replace('00', '&', $search_by_receivers);

if ($search_by_receivers != '0') {
	$this->db->where('receiver', $search_by_receivers);
}

if ($from != 0 && $to != 0) {
	$this->db->where('date_timestamp BETWEEN "' . strtotime($from) . '" AND "' . strtotime($to) . '"');
}

$this->db->select('token_no, timestamp');
$this->db->distinct();
$this->db->from('items_transfers');
$this->db->order_by('timestamp', 'asc');
$transfer_query = $this->db->get()->result_array();
?>
                                    <div class="row">
                                        <table class="table table-bordered table-striped" style="width:100%; border-collapse:collapse;" id="item_transfer_list">
                                            <thead class="bg-info">
                                                <!--<tr>
                                                    <td colspan="5" style="text-align: right; font-size: 24px"><strong>Balance B/D as at 14th March, 2022:</strong></td>
                                                    <td style="text-align: left; font-size: 24px">
                                                        <strong>985 Bags</strong>
                                                    </td>
                                                </tr>-->
                                              <tr style="border-bottom: 1px solid #000;">
                                                <th style="text-align: left">S/N</th>
                                                <th style="text-align: left">Date</th>

                                                <th style="text-align: left">Receiver</th>
                                                <th style="text-align: left">Token Number</th>
                                                <th style="text-align: right">Item(s)</th>
                                                <th style="text-align: right">Q'ty</th>
                                                <th style="text-align: right">Price</th>
                                                <th style="text-align: right">Value</th>
                                                <th style="text-align: right">Cashier</th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              <?php
$total_quantity = 0;
$transfer_counter = 1;

foreach ($transfer_query as $q):
	// array_push($transfer_array, $q['token_no']);

	if ($from != 0 && $to != 0) {
		$this->db->where('date_timestamp BETWEEN "' . strtotime($from) . '" AND "' . strtotime($to) . '"');
	}
	$this->db->select_sum('quantity');
	$this->db->where('token_no', $q['token_no']);
	$total_quantity = $this->db->get('items_transfers')->row()->quantity;

	//find other data
	if ($from != 0 && $to != 0) {
		$this->db->where('date_timestamp BETWEEN "' . strtotime($from) . '" AND "' . strtotime($to) . '"');
	}
	$date = $this->db->get_where('items_transfers', array('token_no' => $q['token_no']))->row()->date;

	if ($from != 0 && $to != 0) {
		$this->db->where('date_timestamp BETWEEN "' . strtotime($from) . '" AND "' . strtotime($to) . '"');
	}
	$receiver = $this->db->get_where('items_transfers', array('token_no' => $q['token_no']))->row()->receiver;

	if ($from != 0 && $to != 0) {
		$this->db->where('date_timestamp BETWEEN "' . strtotime($from) . '" AND "' . strtotime($to) . '"');
	}
	$item_id = $this->db->get_where('items_transfers', array('token_no' => $q['token_no']))->row()->item_id;

	$item_name = $this->db->get_where('items', array('item_id' => $item_id))->row()->item_name;

	if ($from != 0 && $to != 0) {
		$this->db->where('date_timestamp BETWEEN "' . strtotime($from) . '" AND "' . strtotime($to) . '"');
	}
	$sales_person_id = $this->db->get_where('items_transfers', array('token_no' => $q['token_no']))->row()->sales_person_id;
	$sales_person = $this->db->get_where('admin', array('admin_id' => $sales_person_id))->row()->name;

    if ($from != 0 && $to != 0) {
        $this->db->where('date_timestamp BETWEEN "' . strtotime($from) . '" AND "' . strtotime($to) . '"');
    }
    $this->db->where('item_id', $item_id);
    $this->db->order_by('stock_id', 'DESC');
    $this->db->limit(1);
    $sellingPrice = $this->db->get('stock_manager')->row()->selling_price;

	?>
      <tr style="border: 1px solid black" ondblclick="deselect_all()" onclick="populate_links('<?=$q['token_no']?>')" id="token_no<?=$q['token_no'];?>">
        <td><?=$transfer_counter;?></td>
        <td><?=$date;?></td>

        <td style="vertical-align: middle"><?=$receiver;?></td>
        <td style="vertical-align: middle"><?=$q['token_no'];?></td>
        <td style="vertical-align: middle" align="right">
            <table>
                <tbody>
                    <?php
	$items_q = $this->db->get_where('items_transfers', array('token_no' => $q['token_no']))->result_array();

	foreach ($items_q as $it):
		$it_name = $this->db->get_where('items', array('item_id' => $it['item_id']))->row()->item_name;

		?>
        <tr>
            <td><?=$it_name;?></td>
            <td align="right"><strong><?=number_format($it['quantity'], 0, '.', ',');?></strong></td>
        </tr>
        <?php
    endforeach;
	?>
            </tbody>
        </table>
    </td>
    <td style="vertical-align: middle" align="right"><strong><?=number_format($total_quantity, 0, '.', ',');?></strong></td>
    <td style="vertical-align: middle" align="right"><strong><?=number_format($sellingPrice, 0, '.', ',');?></strong></td>
    <td style="vertical-align: middle" align="right"><strong><?=number_format(($total_quantity * $sellingPrice), 0, '.', ',');?></strong></td>
    <td style="vertical-align: middle" align="right"><strong><?=$sales_person;?></strong></td>
  </tr>

  <?php
	//find grand total and amount
	if ($from != 0 && $to != 0) {
		$this->db->where('date_timestamp BETWEEN "' . strtotime($from) . '" AND "' . strtotime($to) . '"');
	}
	$grand_quantity += $this->db->get_where('items_transfers', array('token_no' => $q['token_no']))->row()->total_quantity;

	$transfer_counter++;
    $grand_value += ($total_quantity * $sellingPrice);

endforeach;
?>
                                <tr style="border-top: 2px solid #1b1b69;">
                                    <td colspan="5"><strong style="font-size: 20px">TOTAL PICKED</strong></td>
                                    <td align="right"><strong style="font-size: 20px"><?=number_format($grand_quantity, 0, '.', ',');?></strong></td>
                                    <td></td>
                                    <td align="right"><strong style="font-size: 20px"><?=number_format($grand_value, 2, '.', ',');?></strong></td>
                                    <td></td>

                                </tr>
                                
                                <!--<tr style="border-top: 2px solid #1b1b69;">
                                    <td colspan="5"><strong style="font-size: 20px">DEBIT BALANCE</strong></td>
                                    <td align="right"><strong style="font-size: 20px"><?//=number_format(20, 0, '.', ',');?></strong></td>
                                    <td></td>
                                </tr>-->
                                
                                            </tbody>
                                        </table>
                                    </div>
                            </div>


                                <footer class="footer" style="position: fixed; bottom: -35px">
                                    <div>
                                        <div>
                                         <!--   <table class="table table-bordered table-striped" style="width:100%; border-collapse:collapse; margin-top: 10px;">
                                                <thead>
                                                    <tr style="height: 30px;">
                                                        <th colspan="6" style="text-align: right;">Grand Total: </th>
                                                        <th style="text-align: right;"><?=numfmt_format_currency($fmt, $grand_total, $currency);?></th>
                                                    </tr>
                                                    <tr style="height: 30px;">
                                                        <th colspan="6" style="text-align: right;">Amount Paid: </th>
                                                        <th style="text-align: right;"><?=numfmt_format_currency($fmt, $this->db->get_where('payment_with_goods', array('so_code' => $so_code))->row()->amount_paid, $currency);?></th>
                                                    </tr>
                                                    <tr style="height: 30px;">
                                                        <th colspan="6" style="text-align: right;">Balance Due: </th>
                                                        <th style="text-align: right;" width="160"><?=numfmt_format_currency($fmt, $this->db->get_where('payment_with_goods', array('so_code' => $so_code))->row()->amount_due, $currency);?></th>
                                                    </tr>
                                                    <tr>
                                                        <th colspan="7" style="text-align: left; height: 20px;">
                                                            <h4>Please contact us for more information about our payment options.</h4>
                                                        </th>
                                                    </tr>
                                                    <tr>
                                                        <th colspan="7" style="text-align: left; height: 20px;">
                                                            <h4>Thank you for doing business with us.</h4>
                                                        </th>
                                                    </tr>
                                                </thead>
                                            </table> -->
                                        </div>
                                    </div>
                                    <div style="width: 100%; height: 30px; margin-bottom: 20px; padding: 5px; text-align: left"><smal style="color:#1d1c1c; text-shadow: 1px 1px 0px #504949; position: relative; top: 5px;"><i>Software Developed & Designed by: Lightworld Technologies Ltd. Contact us on 0243618186 | 0247612799 or email us on mail@lightworldtech.com</i></smal></smal></div>
                                </footer>
                            </div>
                        </div>
                    </page>
                    </div>
                 </div>
            </div>
        </div>


    <script type="text/javascript" src="<?php echo base_url('assets/js/jquery-3.3.1.min.js'); ?>"></script>
    <script type="text/javascript" src="<?php echo base_url('assets/js/bootstrap.js'); ?>"></script>
</body>
</html>

<script type="text/javascript">
    jQuery(document).ready(function($)
    {

      //  var elem = $('#print');
        //PrintElem(elem);
        //Popup(data);
        $('#order_count').html('<?php echo $number_of_orders . $order_num; ?>');
    });



 function PrintElem(elem)
    {
        Popup($(elem).html());
    }

    function Popup(data)
    {
        var mywindow = window.open('', '', '');
        mywindow.document.write('<!doctype html><html><head><title>INVOICES REPORT</title>');
        //mywindow.document.write('<link rel="stylesheet" href="assets/css/chartjs/dist/Chart.min.css" type="text\/css" \/>');
        mywindow.document.write('<link rel="stylesheet" type="text/css" href="<?php echo base_url('assets/css/chartjs/dist/Chart.css'); ?>" />');
        mywindow.document.write('<script src="<?php echo base_url('assets/css/chartjs/dist/Chart.js'); ?>" type="text\/javascript"><\/script>');
        mywindow.document.write('<script type="text\/javascript" src="<?php echo base_url('assets/js/jquery-3.3.1.min.js'); ?>"><\/script>');

        mywindow.document.write('<\/head><body style="font-size: 13px">');
        mywindow.document.write(data);

        mywindow.document.write('<\/body><\/html>');
        mywindow.document.close();

        mywindow.onload=function(){
            mywindow.focus();
            mywindow.print();
            mywindow.close();
        }

    }


    function print_page() {
        //window.location.reload();
        print();
       }

       function page_reload() {
        window.location.reload();
       }


        $(function() {
            setTimeout(() => {
              print_page();
            }, 1000);

        });
</script>

