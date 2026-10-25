
<!doctype html>
<html>
    <head>
        <title><?=$page_title; ?></title>
        <link rel="stylesheet" href="<?php echo base_url('assets/css/font-icons/entypo/css/entypo.css.min.css'); ?>"/>
        <link rel="stylesheet" href="http://fonts.googleapis.com/css?family=Noto+Sans:400,700,400italic"/>
        <link rel="stylesheet" type="text/css" href="<?php echo base_url('assets/css/chartjs/dist/Chart.min.css');?>"/>
        <link rel="shortcut icon" href="<?php echo base_url('uploads/school_logo.png');?>">
        <!--Chartjs-->
        <script src="<?php echo base_url('assets/css/chartjs/dist/Chart.min.js');?>" type="text/javascript"></script>

    </head>
    <body>  

        <div class="container">
            <div class="row" style="margin-top: 15px; position: fixed; right: 5px; z-index: 9999" id="print_div">
                <a href="javascript:void(0);" onClick="page_reload()">PRINT ALL ITEMS REPORT</a>
            </div>
            <div class="row">
                <div class="col-lg-12">
                    <div id="print">
                        <?php
                        //Account section
                        $currency = $this->db->get_where('settings', array('type' => 'currency'))->row()->description;
                        $fmt = new NumberFormatter('en_US', NumberFormatter::CURRENCY);

                        $system_name        =   $this->db->get_where('settings' , array('type'=>'system_name'))->row()->description;
                        $location           =   $this->db->get_where('settings' , array('type'=>'location'))->row()->description;
                        $address            =   $this->db->get_where('settings' , array('type'=>'address'))->row()->description;
                        $phone            =   $this->db->get_where('settings' , array('type'=>'phone'))->row()->description;

                        if($to == 0) {

                            $to = date('d-m-Y');
                        }


                        ?>

                       

                        <link rel="stylesheet" type="text/css" href="<?php echo base_url('assets/css/chartjs/dist/Chart.min.css');?>"/>
                        <!--Chartjs-->
                        <script src="<?php echo base_url('assets/css/chartjs/dist/Chart.min.js');?>" type="text/javascript"></script>
                        <script src="<?php echo base_url('assets/js/jquery-3.3.1.min.js');?>"></script>

                        <style type="text/css">
                            
                             #mark_print th, #grade_table th, #conducts th {
                                /*background-color: grey;*/
                                padding: 5px;
                                color: #000000;
                                border-bottom: 2px solid #e2dddd;
                             }

                             #invoice_table thead tr th {
                                color: #fff !important;
                             }

                              #invoice_table thead {
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

                            page[size="A4"], #total_supply {
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
                                    width: 80% !important;
                                }

                                 #total_supply, #total_transfer, #invoice_table, #hr_line, #top_row, .footer {
                                    width: 130% !important;
                                }

                                pre {
                                    display: block;
                                    font-family: monospace;
                                    white-space: pre-wrap;
                                    margin: -40px 0px;
                                    line-height: 20px;
                                }

                                page[size="A4"], #total_supply {
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
                            <h3 style="font-weight: bold; font-size: 20px; letter-spacing: 2px;"><?php echo $system_name;?></h3>
                            <pre>
                                <h4 style="font-family: Nunito" align='left'><?php echo trim($address);?></h4>
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
                            <td align="right" colspan="2"><h1 style="font-weight: bold; font-size: 20px; letter-spacing: 2px;"><?= $page_title; ?></h1></td>
                        </tr>
                        <tr>
                            <td align="right">PERIOD AS AT: </td>
                            <td align="right"><strong><?=strtoupper(date('l F, j Y', strtotime('today'))); ?></strong></td> 
                        </tr>

                        <tr>
                            <td align="right">ITEM#: </td>
                            <td align="right"><strong id="item_no"></strong></td> 
                        </tr>
                    
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
    
    <!--ORDER SUMMARY-->
    <div class="table table-responsive">
        <table class="table table-bordered table-striped" id="invoice_table" style="width:100%; border-collapse:collapse; page-break-after:  always;  margin-top: 10px;" border="1">
            <thead style="background-color: #4242ad; padding: 30px;">
                
                <tr style="height: 30px;">
                    <th style="text-align: left; padding: 0px 3px">S/N</th>
                    <th style="text-align: left; padding: 0px 3px">ITEM</th>
                    <th style="text-align: right; padding: 0px 3px">QUANTITY</th>
                    <th></th>
                </tr>
            </thead>
            <tbody>
                <tr style="border-bottom: 1px solid #000;">
                    <td align="left" colspan="5">
                        <h3 style="text-align: left">TOTAL STOCK AVAILABLE</h3>
                    </td>
                </tr>
            <?php 


            //for suppliers
            if($supplier_id[0] == '' && sizeof($supplier_id) == 1) {
                //all category selected

                //not or all supplier selected
                //for category
                if($category_id[0] == '' && sizeof($category_id) == 1 || $category_id[0] == '' && sizeof($category_id) == 0) {
                    //all category selected
                    
                    $this->db->select('category_id');
                    $this->db->from('items');
                    //$this->db->where_in('category_id', $category_ids);
                    $this->db->distinct();
                    $all_item_category_query = $this->db->get();//
                    $all_item_category_array = $all_item_category_query->result_array(); 

                } else {

                    $this->db->select('category_id');
                    $this->db->from('items');
                    $this->db->where_in('category_id', $category_id);
                    $this->db->distinct();
                    $all_item_category_query = $this->db->get();
                    $all_item_category_array = $all_item_category_query->result_array();
                }

                    $grand_total_amount = 0;
                    $item_no = 0;
                    $_1HTotal = 0;
                    $singleTotal = 0;

                    foreach($all_item_category_array as $cat):
                        $category_name = $this->db->get_where('item_category', array('category_id' => $cat['category_id']))->row()->category_name;

                    echo '<tr>
                                <td colspan="5"><strong style="font-size: 16px;">'.$category_name .'</strong></td>
                            </tr>';

                    $this->db->where('category_id', $cat['category_id']);
                    
                    $order_items_query_po = $this->db->get('items');//
                    $order_items_array_po = $order_items_query_po->result_array();  


                        $sn = 1;
                        $itemTotal = 0;
                        $count1HDoors = 0;

                         foreach($order_items_array_po as $item_po):

                            $item_name = $item_po['item_name'];
                            $item_quantity = $item_po['quantity'];

                            $itemTotal += $item_quantity;

                            $strposition = strpos($item_name, '1H');

                            if($strposition !== false) {
                                $count1HDoors += $item_quantity;
                            }

                            ?>

                            
                            <tr>
                                
                                <td align="left" width="40"><?=$sn; ?>
                                </td>
                                <td align="left" width="250" ><?=$item_name; ?></td>
                                <td align="right" width="80"><?=number_format($item_quantity, 0, '.', ','); ?></td>
                                <td></td>
                            </tr>
                            
                            <?php
                            $sn++;

                            

                         endforeach; //end of items under each category

                         $item_no += $itemTotal;
                         $_1HTotal += $count1HDoors;

                         $singleDoors = $itemTotal - $count1HDoors;
                         $singleTotal += $singleDoors;

                         ?>

                            
                            <tr>
                                
                                <td align="left" colspan="2">
                                    TOTAL:<br>
                                    1H:<br>
                                    SINGLE:<br>
                                </td>
                                <td align="right" width="80"><strong>
                                    <?=number_format($itemTotal, 0, '.', ','); ?><br>
                                    <?=number_format($count1HDoors, 0, '.', ','); ?><br>
                                    <?=number_format($singleDoors, 0, '.', ','); ?>
                                        
                                    </strong></td>
                                <td></td>
                            </tr>
                            
                            <?php

                     endforeach; //end of each category

                     

                     /*==========================
                        *END OF NO SUPPLIER OR ALL SUPPLIER SELECTED
                     */

            } else {
                /*==========================
                    *SUPPLIER OR ALL SELECTED
                 */

                $this->db->select('supplier_id');
                $this->db->from('items');
                $this->db->where_in('supplier_id', $supplier_id);
                $this->db->distinct();
                $all_item_supplier_query = $this->db->get();
                $all_item_supplier_array = $all_item_supplier_query->result_array();




                foreach($all_item_supplier_array as $sup) {

                    $supplier_name = $this->db->get_where('suppliers', array('supplier_id' => $sup['supplier_id']))->row()->supplier_name;
                    echo '<tr>
                            <td colspan="5" style="background-color: #b5b5b5; color: #fff;"><strong style="font-size: 16px;">'.$supplier_name .'</strong></td>
                        </tr>';

                    //for category
                    if($category_id[0] == '') {
                        //all category selected
                        
                        $this->db->select('category_id');
                        $this->db->from('items');
                        $this->db->where('supplier_id', $sup['supplier_id']);
                        $this->db->distinct();
                        $all_item_category_query = $this->db->get();//
                        $all_item_category_array = $all_item_category_query->result_array(); 

                    } else {

                        $this->db->select('category_id');
                        $this->db->from('items');
                        $this->db->where_in('category_id', $category_id);
                        $this->db->where('supplier_id', $sup['supplier_id']);
                        $this->db->distinct();
                        $all_item_category_query = $this->db->get();
                        $all_item_category_array = $all_item_category_query->result_array();
                    }

                        

                        foreach($all_item_category_array as $cat):
                            $category_name = $this->db->get_where('item_category', array('category_id' => $cat['category_id']))->row()->category_name;

                        echo '<tr>
                                    <td colspan="5"><strong style="font-size: 16px;">'.$category_name .'</strong></td>
                                </tr>';

   
                        $this->db->where('supplier_id', $sup['supplier_id']);                     
                        $this->db->where('category_id', $cat['category_id']);
                    
                        $order_items_query_po = $this->db->get('items');//
                        $order_items_array_po = $order_items_query_po->result_array();  


                            $sn = 1;


                             foreach($order_items_array_po as $item_po):

                                $item_name = $item_po['item_name'];

                                
                                ?>

                                
                                <tr>
                                    
                                    <td align="left"><?=$sn; ?>
                                    </td>
                                    <td align="left"><?=$item_name; ?></td>

                                </tr>
                                
                                <?php
                                $sn++;

                             endforeach; //end of items under each category

                         endforeach; //end of each category
                } //end of each supplier
            }

            
                 ?>
                
               
            </tbody>
        </table>   
    </div>
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
$(function(e) {
    $('#item_no').html('GRAND TOTAL:  <?=$item_no?> <br> 1H: <?=$_1HTotal?> <br> SINGLE: <?=$singleTotal?>');
})
   
 function PrintElem(elem)
    {
        Popup($(elem).html());
    }

    function Popup(data)
    {
        var mywindow = window.open('', '', '');
        mywindow.document.write('<!doctype html><html><head><title>INVENTORY REPORT AS AT <?=strtoupper(date('l F, j Y', strtotime($to))); ?></title>');
        //mywindow.document.write('<link rel="stylesheet" href="assets/css/chartjs/dist/Chart.min.css" type="text\/css" \/>');
        mywindow.document.write('<link rel="stylesheet" type="text/css" href="<?php echo base_url('assets/css/chartjs/dist/Chart.css');?>" />');
        mywindow.document.write('<script src="<?php echo base_url('assets/css/chartjs/dist/Chart.js');?>" type="text\/javascript"><\/script>');
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

