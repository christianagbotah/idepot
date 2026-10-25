<?php
$from=$from??0;
$to=$to??0;
$customer_id=$customer_id??0;
$item_id=$item_id??0;
$status=$status??'All';
$type_of_sales=$type_of_sales??'0';
$settings=$this->db->where_in('type',['currency','system_name','address','phone'])->get('settings')->result_array();
$s=array_column($settings,'description','type');
$s['currency']=$s['currency']??'USD';
$s['system_name']=$s['system_name']??'System';
$s['address']=$s['address']??'';
$s['phone']=$s['phone']??'';
$fmt=new NumberFormatter('en_US',NumberFormatter::CURRENCY);
if($from==0&&$to==0){
$this->db->select('date_timestamp')->from('payment_with_goods')->order_by('date_timestamp','asc')->limit(1);
$first_row=$this->db->get()->row();
$from=$first_row?date('d-m-Y',$first_row->date_timestamp):date('d-m-Y');
$to=date('d-m-Y');
}
$this->db->select_sum('quantity');
if($from!=0&&$to!=0)$this->db->where('date_timestamp BETWEEN "'.strtotime($from).'" AND "'.strtotime($to).'"');
if($item_id!=0)$this->db->where('item_id',$item_id);
$total_q_transfer=$this->db->get('items_transfers')->row()->quantity??0;
$this->db->select('date,token_no,sales_person_id');
if($from!=0&&$to!=0)$this->db->where('date_timestamp BETWEEN "'.strtotime($from).'" AND "'.strtotime($to).'"');
if($item_id!=0)$this->db->where('item_id',$item_id);
$this->db->limit(1);
$transfer_row=$this->db->get('items_transfers')->row();
$cashier_t='';
if($transfer_row){
$cashier_id=$transfer_row->sales_person_id??0;
$cashier_row=$this->db->get_where('admin',['admin_id'=>$cashier_id])->row();
$cashier_t=$cashier_row?($cashier_row->name??''):'';
}
$this->db->select('so_code,date_timestamp,customer_id,status,type_of_sales,sales_person_id,total_quantity,grand_total,amount_paid,amount_due');
$this->db->where('opening_entry',0);
if($customer_id!=0)$this->db->where('customer_id',$customer_id);
if($item_id!=0)$this->db->where('item_id',$item_id);
if($status!='All')$this->db->where('status',$status);
if($from!=0&&$to!=0)$this->db->where('date_timestamp BETWEEN "'.strtotime($from).'" AND "'.strtotime($to).'"');
if($type_of_sales!='0')$this->db->where('type_of_sales',$type_of_sales);
$this->db->group_by('so_code');
$this->db->order_by('date_timestamp','asc');
$orders=$this->db->get('payment_with_goods')->result_array();
$orders_by_so=[];
foreach($orders as $o)$orders_by_so[$o['so_code']]=$o;
$so_codes=!empty($orders)?array_column($orders,'so_code'):[];
$qty_picked_map=[];
$qty_due_map=[];
$grand_qty_picked_map=[];
if(!empty($so_codes)){
$this->db->select('so_code,SUM(quantity_picked)as qty,date_timestamp');
$this->db->where('opening_entry',0);
if($customer_id!=0)$this->db->where('customer_id',$customer_id);
if($item_id!=0)$this->db->where('item_id',$item_id);
if($status!='All')$this->db->where('status',$status);
if($from!=0&&$to!=0)$this->db->where('date_timestamp BETWEEN "'.strtotime($from).'" AND "'.strtotime($to).'"');
if($type_of_sales!='0')$this->db->where('type_of_sales',$type_of_sales);
$this->db->where_in('so_code',$so_codes);
$this->db->group_by(['so_code','date_timestamp']);
$qty_data=$this->db->get('payment_with_goods')->result_array();
foreach($qty_data as $qd)$qty_picked_map[$qd['so_code'].'_'.$qd['date_timestamp']]=$qd['qty'];
$this->db->select('so_code,SUM(quantity_picked)as qty');
$this->db->where_in('so_code',$so_codes);
$this->db->group_by('so_code');
$grand_qty=$this->db->get('payment_with_goods')->result_array();
foreach($grand_qty as $gq)$grand_qty_picked_map[$gq['so_code']]=$gq['qty'];
$this->db->select('so_code,SUM(quantity_due)as qty,date_timestamp');
$this->db->where_in('so_code',$so_codes);
$this->db->group_by(['so_code','date_timestamp']);
$qty_due=$this->db->get('payment_with_goods')->result_array();
foreach($qty_due as $qdu)$qty_due_map[$qdu['so_code'].'_'.$qdu['date_timestamp']]=$qdu['qty'];
}
$payments_map=[];
if(!empty($so_codes)){
$this->db->select('so_code,SUM(amount)as total,timestamp');
$this->db->where_in('so_code',$so_codes);
if($from!=0&&$to!=0)$this->db->where('timestamp BETWEEN "'.strtotime($from).'" AND "'.strtotime($to).'"');
$this->db->group_by(['so_code','timestamp']);
$payments=$this->db->get('payment')->result_array();
foreach($payments as $pm)$payments_map[$pm['so_code'].'_'.$pm['timestamp']]=$pm['total'];
}
$customer_ids=!empty($orders)?array_unique(array_column($orders,'customer_id')):[];
$customers=!empty($customer_ids)?$this->db->select('customer_id,customer_name')->where_in('customer_id',$customer_ids)->get('customers')->result_array():[];
$customers_map=!empty($customers)?array_column($customers,'customer_name','customer_id'):[];
$cashier_ids=!empty($orders)?array_unique(array_column($orders,'sales_person_id')):[];
$cashiers=!empty($cashier_ids)?$this->db->select('admin_id,name')->where_in('admin_id',$cashier_ids)->get('admin')->result_array():[];
$cashiers_map=!empty($cashiers)?array_column($cashiers,'name','admin_id'):[];
$grand_quantity=0;
$grand_quantity_bought=0;
$grand_amount=0;
$grand_amount_paid=0;
$order_counter=0;
$seen_so=[];
?>
<!doctype html>
<html>
<head>
<title><?=$page_title??'Sales Order Report'?></title>
<link rel="stylesheet" href="<?=base_url('assets/css/font-icons/entypo/css/entypo.css.min.css')?>"/>
<link rel="stylesheet" href="http://fonts.googleapis.com/css?family=Noto+Sans:400,700,400italic"/>
<link rel="stylesheet" href="<?=base_url('assets/css/chartjs/dist/Chart.min.css')?>"/>
<link rel="shortcut icon" href="<?=base_url('uploads/school_logo.png')?>">
<script src="<?=base_url('assets/css/chartjs/dist/Chart.min.js')?>"></script>
<style>#mark_print th,#grade_table th,#conducts th{padding:5px;color:#000;border-bottom:2px solid #e2dddd}#invoice_table thead tr th{color:#fff!important}#invoice_table thead{padding:10px 0!important}pre{display:block;font-family:monospace;white-space:pre-wrap;margin:-40px 0;line-height:20px}body{font-size:14px!important}.account_tb th{background-color:grey;border:1px solid #e2dddd;padding:5px;color:#fff;border-bottom:1px solid red;text-align:left}td{padding:5px}#grade_table tbody tr td{line-height:25px}#term{background-color:#000;padding:5px 15px;border-radius:9px;font-size:24px;letter-spacing:5px;color:#fff}table tr th{padding:0 5px}div .logo{position:absolute;margin-top:20px;left:10px}div .photo_passport{position:absolute;margin-top:-100px;right:10px;border-radius:16% 6%}page[size="A4"]{width:21cm;height:29.7cm;page-break-after:always}#print_div a{background-color:#000;color:#fff;padding:5px;border-radius:14px;font-size:15px;font-weight:bold}#print_div a:hover{background-color:green;color:#fff}.footer{position:relative;bottom:0}#promote{position:absolute;margin-top:-32px}#status{position:relative;margin-top:-120px;transform:rotate(-45deg)}@media Print{.footer{position:fixed;bottom:0}page{background:#fff;display:block;margin:0 auto;margin-bottom:.5cm;box-shadow:0}#order_summary{width:130%!important}#invoice_table,#hr_line,#top_row,.footer{width:130%!important}pre{display:block;font-family:monospace;white-space:pre-wrap;margin:-40px 0;line-height:20px}page[size="A4"]{width:21cm;height:29.7cm;page-break-after:always}body,page{margin:0;box-shadow:0}#print_div{display:none}div .logo{position:absolute;margin-top:20px;left:10px}div .photo_passport{position:absolute;margin-top:-75px!important;right:10px}#top_row{margin-top:-15px}#student_details p{line-height:30px}#promote{margin-top:-32px}#box{margin-top:-10px}#gh{margin-top:-15px}.sign{position:fixed;bottom:5px}}</style>
</head>
<body>
<div class="container">
<div class="row" style="margin-top:15px;position:fixed;right:5px;z-index:9999" id="print_div">
<a href="javascript:void(0);" onClick="print()">Print Sales Order List</a>
</div>
<div class="row"><div class="col-lg-12"><div id="print">
<script src="<?=base_url('assets/js/jquery-3.3.1.min.js')?>"></script>
<page size="A4">
<center>
<table class="table table-bordered table-striped" id="top_row" style="width:100%;border-collapse:collapse;margin-top:10px">
<tbody>
<tr>
<td width="50%">
<table class="table table-bordered table-striped" style="margin-top:-10px;border-collapse:collapse">
<thead>
<tr>
<td><img src="<?=base_url()?>uploads/school_logo.png" style="max-height:80px"></td>
<td><h3 style="font-weight:bold;font-size:20px;letter-spacing:2px"><?=$s['system_name']?></h3>
<pre><h4 style="font-family:Nunito" align='left'><?=trim($s['address'])?></h4></pre></td>
</tr>
<tr style="border-top:2px solid #1b1b69"><td colspan="2"></td></tr>
</thead>
</table>
</td>
<td width="50%">
<table class="table table-bordered table-striped" style="width:100%;margin-top:-65px;border-collapse:collapse">
<thead>
<tr><td align="right" colspan="2"><h1 style="font-weight:bold;font-size:20px;letter-spacing:2px"><?=$page_title?></h1></td></tr>
<tr><td align="right">Period:</td><td align="right"><strong>From: <?=$from?> To: <?=$to?></strong></td></tr>
<tr><td align="right">Order Count:</td><td align="right"><strong id="order_count"></strong></td></tr>
<tr style="border-top:2px solid #1b1b69"><td colspan="2"></td></tr>
</thead>
</table>
</td>
</tr>
</tbody>
</table>
</center>
<div class="row"><div class="col-lg-12 col-md-12">
<div class="row">
<div class="table table-responsive">
<table class="table table-bordered table-striped" id="invoice_table" style="width:100%;border-collapse:collapse;margin-top:10px">
<thead style="background-color:#717173;padding:30px">
<tr style="height:30px;border-right:1px solid #000">
<th style="text-align:left" width="50">S/N</th>
<th style="text-align:left">Date</th>
<th style="text-align:left">Order</th>
<th style="text-align:left">Customer</th>
<th style="text-align:left">Status</th>
<th style="text-align:left">Sales Type</th>
<th style="text-align:right">Qty Sold</th>
<th style="text-align:right">Qty Picked</th>
<th style="text-align:right">Total Picked</th>
<th style="text-align:right">Qty Left</th>
<th style="text-align:right">Amount (<?=$s['currency']?>)</th>
<th style="text-align:right">Cash Received (<?=$s['currency']?>)</th>
<th style="text-align:right">Cashier</th>
</tr>
</thead>
<tbody>
<?php
$sn=0;
foreach($orders as $o):
$sn++;
$date=date('d-m-Y',$o['date_timestamp']);
$qty_picked=$qty_picked_map[($o['so_code']??'').'_'.($o['date_timestamp']??0)]??0;
$grand_qty_picked=$grand_qty_picked_map[$o['so_code']??'']??0;
$qty_due=$qty_due_map[($o['so_code']??'').'_'.($o['date_timestamp']??0)]??0;
$total_amount=$o['grand_total']??0;
$total_amount_paid=$o['amount_paid']??0;
if(($o['type_of_sales']??'')=='Payables'){
$payment_key=($o['so_code']??'').'_'.($o['date_timestamp']??0);
if(isset($payments_map[$payment_key])){
$total_amount_paid=$payments_map[$payment_key];
}else{
$total_amount_paid=0;
}
if(isset($seen_so[$o['so_code']??''])){
$total_amount=0;
}
}
$seen_so[$o['so_code']??'']=1;
$customer_name=$customers_map[$o['customer_id']??0]??'Unknown';
$cashier_name=$cashiers_map[$o['sales_person_id']??0]??'';
$cashier_short=substr($cashier_name,0,strpos($cashier_name,' ')?:strlen($cashier_name));
?>
<tr style="border-bottom:1px solid #000">
<td><?=$sn?></td>
<td><?=$date?></td>
<td><?=$o['so_code']?></td>
<td><?=$customer_name?></td>
<td><?=$o['status']??''?></td>
<td><?=$o['type_of_sales']??''?></td>
<td align="right"><?=number_format($o['total_quantity']??0,0,'.',',')?></td>
<td align="right"><?=number_format($qty_picked,0,'.',',')?></td>
<td align="right"><?=number_format($grand_qty_picked,0,'.',',')?></td>
<td align="right"><?=number_format($qty_due,0,'.',',')?></td>
<td align="right"><?=number_format($total_amount,2,'.',',')?></td>
<td align="right"><?=($o['type_of_sales']??'')=='Payables'&&$total_amount_paid==0?'-':number_format($total_amount_paid,2,'.',',')?></td>
<td align="right"><?=$cashier_short?></td>
</tr>
<?php
$grand_quantity+=$qty_picked;
$grand_quantity_bought+=$o['total_quantity'];
$grand_amount+=$total_amount;
$grand_amount_paid+=$total_amount_paid;
$order_counter++;
endforeach;
if($total_q_transfer!=0){
$grand_quantity+=$total_q_transfer;
$sn++;
?>
<tr style="border-bottom:1px solid #000">
<td><?=$sn?></td>
<td>-</td>
<td>Details Below</td>
<td>TOTAL TRANSFER(S)</td>
<td>-</td>
<td>-</td>
<td align="right">-</td>
<td align="right"><?=number_format($total_q_transfer,0,'.',',')?></td>
<td align="right">-</td>
<td align="right">-</td>
<td align="right">-</td>
<td align="right">-</td>
<td align="right"><?=substr($cashier_t,0,strpos($cashier_t,' ')?:strlen($cashier_t))?></td>
</tr>
<?php }?>
<tr>
<td colspan="6"><strong>Total</strong></td>
<td align="right" style="border-top:1px solid #000;border-style:double none"><strong><?=number_format($grand_quantity_bought,0,'.',',')?></strong></td>
<td align="right" style="border-top:1px solid #000;border-style:double none"><strong><?=number_format($grand_quantity,0,'.',',')?></strong></td>
<td align="right"></td>
<td align="right"></td>
<td align="right" style="border-top:1px solid #000;border-style:double none"><strong><?=numfmt_format_currency($fmt,$grand_amount,$s['currency'])?></strong></td>
<td align="right" style="border-top:1px solid #000;border-style:double none"><strong><?=numfmt_format_currency($fmt,$grand_amount_paid,$s['currency'])?></strong></td>
<td></td>
</tr>
</tbody>
</table>
</div>
</page>
<footer class="footer" style="position:fixed;bottom:-35px">
<div style="width:100%;height:30px;margin-bottom:20px;padding:5px;text-align:left"><smal style="color:#1d1c1c;text-shadow:1px 1px 0 #504949;position:relative;top:5px"><i>Software Developed & Designed by: Lightworld Technologies Ltd. Contact us on 0243618186 | 0247612799 or email us on mail@lightworldtech.com</i></smal></div>
</footer>
</div></div>
</div></div></div>
</div>
<script src="<?=base_url('assets/js/bootstrap.js')?>"></script>
<script>
$(function(){
$('#order_count').html('<?=number_format($order_counter,0,'.',',')?> <?=$order_counter>1?"Orders":"Order"?>');
setTimeout(()=>{print();},1000);
});
</script>
</body>
</html>
