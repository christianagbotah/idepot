<style>.alert{padding:5px;border-radius:10px;border:none;background-color:#d0a107;color:#ffe52c}#page_preloader{padding-top:150px;position:fixed;top:0;bottom:0;left:0;right:0;z-index:99999}#page_preloader h3{color:#000}#mark_print th,#grade_table th,#conducts th{padding:5px;color:#000;border-bottom:2px solid #e2dddd}#invoice_table thead tr th{color:#fff!important}#invoice_table thead{padding:10px 0!important}pre{display:block;font-family:monospace;white-space:pre-wrap;margin:-40px 0;line-height:20px}body{font-size:14px!important}.account_tb th{background-color:grey;border:1px solid #e2dddd;padding:5px;color:#fff;border-bottom:1px solid red;text-align:left}td{padding:5px}#grade_table tbody tr td{line-height:25px}#term{background-color:#000;padding:5px 15px;border-radius:9px;font-size:24px;letter-spacing:5px;color:#fff}div .logo{position:absolute;margin-top:20px;left:10px}div .photo_passport{position:absolute;margin-top:-100px;right:10px;border-radius:16% 6%}page[size="A4"],#total_supply{width:21cm;height:29.7cm;page-break-after:always}#print_div a{background-color:#000;color:#fff;padding:5px;border-radius:14px;font-size:15px;font-weight:bold}#print_div a:hover{background-color:green;color:#fff}.footer{position:relative;bottom:0}#promote{position:absolute;margin-top:-32px}#status{position:relative;margin-top:-120px;transform:rotate(-45deg)}@media Print{.footer{position:fixed;bottom:0}page{background:#fff;display:block;margin:0 auto;margin-bottom:.5cm;box-shadow:0}#order_summary{width:80%!important}#total_supply,#total_transfer,#invoice_table,#hr_line,#top_row,.footer{width:130%!important}pre{display:block;font-family:monospace;white-space:pre-wrap;margin:-40px 0;line-height:20px}page[size="A4"],#total_supply{width:21cm;height:29.7cm;page-break-after:always}body,page{margin:0;box-shadow:0}#print_div{display:none}div .logo{position:absolute;margin-top:20px;left:10px}div .photo_passport{position:absolute;margin-top:-75px!important;right:10px}#top_row{margin-top:-15px}#student_details p{line-height:30px}#promote{margin-top:-32px}#box{margin-top:-10px}#gh{margin-top:-15px}.sign{position:fixed;bottom:5px}}</style>
<link rel="stylesheet" href="<?=base_url('assets/css/chartjs/dist/Chart.min.css')?>"/>
<script src="<?=base_url('assets/css/chartjs/dist/Chart.min.js')?>"></script>
<script src="<?=base_url('assets/js/jquery-3.3.1.min.js')?>"></script>
<div class="container">
<div class="row" style="margin-top:15px;position:fixed;right:5px;z-index:9999" id="print_div">
<a href="javascript:void(0);" onClick="print()">Print Backlog</a>
</div>
<div class="row"><div class="col-lg-12"><div id="print">
<?php
$settings=$this->db->where_in('type',['currency','system_name','location','address','phone'])->get('settings')->result_array();
$s=array_column($settings,'description','type');
$currency=$s['currency'];
$fmt=new NumberFormatter('en_US',NumberFormatter::CURRENCY);
$system_name=$s['system_name'];
$location=$s['location'];
$address=$s['address'];
$phone=$s['phone'];
$exact_date=true;
if($from==0&&$to==0){
$to=date('d-m-Y');
}else{
$this->db->where('date_timestamp',strtotime($to))->limit(1);
$date_row=$this->db->get('stock_manager')->num_rows();
if($date_row>0){
$to=$to;
}else{
$this->db->where('date_timestamp',strtotime($to))->limit(1);
$date_row_pwg=$this->db->get('payment_with_goods')->num_rows();
if($date_row_pwg>0){
$to=$to;
}else{
$this->db->where('date_timestamp <=',strtotime($to))->order_by('so_id','desc')->limit(1);
$new_date=$this->db->get('payment_with_goods')->row()->date_timestamp;
$to=date('d-m-Y',$new_date);
$exact_date=false;
}}}
?>
<page size="A4">
<center>
<table class="table table-bordered table-striped" id="top_row" style="width:100%;border-collapse:collapse;margin-top:10px">
<tbody>
<tr>
<td width="50%">
<table class="table table-bordered table-striped" style="margin-top:-10px;border-collapse:collapse">
<thead>
<tr>
<td><img src="<?=base_url()?>uploads/school_logo.png" style="max-height:100px"></td>
<td><h3 style="font-weight:bold;font-size:20px;letter-spacing:2px"><?=$system_name?></h3>
<pre><h4 style="font-family:Nunito" align='left'><?=trim($address)?></h4></pre></td>
</tr>
<tr style="border-top:2px solid #1b1b69"><td colspan="2"></td></tr>
</thead>
</table>
</td>
<td width="50%">
<table class="table table-bordered table-striped" style="width:100%;margin-top:-65px;border-collapse:collapse">
<thead>
<tr><td align="right" colspan="2"><h1 style="font-weight:bold;font-size:20px;letter-spacing:2px"><?=$page_title?></h1></td></tr>
<tr><td align="right">Period:</td><td align="right"><strong>On: <?=$to?></strong></td></tr>
<tr style="border-top:2px solid #1b1b69"><td colspan="2"></td></tr>
</thead>
</table>
</td>
</tr>
</tbody>
</table>
</center>
<?php
if($category_id[0]==''&&sizeof($category_id)==1||$category_id[0]==''&&sizeof($category_id)==0){
$this->db->select('category_id')->from('items')->distinct();
$all_item_category_query=$this->db->get();
}else{
$this->db->select('category_id')->from('items')->where_in('category_id',$category_id)->distinct();
$all_item_category_query=$this->db->get();
}
$all_item_category_array=$all_item_category_query->result_array();


?>
<div class="row"><div class="col-lg-12 col-md-12">
<?=!$exact_date?'<div class="alert alert-danger">This is not for the exact date you selected because we found out that no transaction happened on that day. We tried further to fetch just the <strong>last day</strong> with transactions nearer to your selected date.</div>':''?>
<div class="table table-responsive">
<table class="table table-bordered table-striped" id="invoice_table" style="width:100%;border-collapse:collapse;page-break-after:always;margin-top:10px">
<thead style="background-color:#4242ad;padding:30px">
<tr style="height:30px">
<th style="text-align:left;padding:0 3px">Date</th>
<th style="text-align:left;padding:0 3px">Item</th>
<th style="text-align:right;padding:0 3px">Opening Stock</th>
<th style="text-align:right;padding:0 3px">Purchases</th>
<th style="text-align:right;padding:0 3px">Total</th>
<th style="text-align:right;padding:0 3px">Sales(S)</th>
<th style="text-align:right;padding:0 3px">Transfers(T)</th>
<th style="text-align:right;padding:0 3px">(S+T)</th>
<th style="text-align:right;padding:0 3px">Closing Stock</th>
</tr>
</thead>
<tbody>
<tr style="border-bottom:1px solid #000"><td align="left" colspan="10"><h3 style="text-align:left">TOTAL ORDER AVAILABLE</h3></td></tr>
<?php
$cat_ids=array_column($all_item_category_array,'category_id');
$all_categories=!empty($cat_ids)?$this->db->where_in('category_id',$cat_ids)->get('item_category')->result_array():[];
$categories_map=array_column($all_categories,'category_name','category_id');
$all_items=!empty($cat_ids)?$this->db->where_in('category_id',$cat_ids)->get('items')->result_array():[];
$items_by_cat=[];
$items_map=[];
$supplier_map=[];



foreach($all_items as $itm){
$items_by_cat[$itm['category_id']][]=$itm;
$items_map[$itm['item_id']]=$itm['item_name'];
$supplier_map[$itm['item_id']]=$itm['supplier_id'];
}


$sup_ids=!empty($all_items)?array_unique(array_column($all_items,'supplier_id')):[];
$all_suppliers=!empty($sup_ids)?$this->db->where_in('supplier_id',$sup_ids)->get('suppliers')->result_array():[];
$suppliers_map=array_column($all_suppliers,'supplier_name','supplier_id');
$this->db->where('date_timestamp',strtotime($to));
if($user_id!='')$this->db->where('user_id',$user_id);
$all_stock=$this->db->get('stock_manager')->result_array();
$stock_by_item=[];


foreach($all_stock as $stk)$stock_by_item[$stk['item_id']]=$stk;
$this->db->select('item_id,SUM(quantity_picked) as total_picked')->where('date_timestamp',strtotime($to))->where('opening_entry','0')->where('order_item_has_unit_sales !=','1')->group_by('item_id');
$all_pwg=$this->db->get('payment_with_goods')->result_array();
$pwg_by_item=array_column($all_pwg,'total_picked','item_id');
$this->db->select('item_id,SUM(quantity) as total_qty')->where('date_timestamp',strtotime($to));

if($user_id!='')$this->db->where('sales_person_id',$user_id);
$this->db->group_by('item_id');
$all_transfers=$this->db->get('items_transfers')->result_array();
$transfers_by_item=array_column($all_transfers,'total_qty','item_id');
$item_ids=!empty($all_items)?array_column($all_items,'item_id'):[];
$all_items_qty=!empty($item_ids)?$this->db->select('item_id,quantity')->where_in('item_id',$item_ids)->get('items')->result_array():[];
$items_qty_map=array_column($all_items_qty,'quantity','item_id');
if(!empty($item_ids))$this->db->where('timestamp',date('Y-m-d',strtotime($to)))->where_in('item_id',$item_ids);
$all_units=$this->db->get('items_in_units_order')->result_array();
$units_by_item=[];
$unit_ids_all=[];


foreach($all_units as $u){
$units_by_item[$u['item_id']][]=$u;
$unit_ids_all[$u['unit_id']]=1;
}



$unit_ids_all=array_keys($unit_ids_all);

$unit_names=!empty($unit_ids_all)?$this->db->select('unit_id,unit_name')->where_in('unit_id',$unit_ids_all)->get('units')->result_array():[];

$unit_names_map=array_column($unit_names,'unit_name','unit_id');


if(!empty($item_ids)&&!empty($unit_ids_all)){
$this->db->select('item_id,unit_id,quantity_per_unit');
$this->db->where_in('item_id',$item_ids);
$this->db->where_in('unit_id',$unit_ids_all);
$unit_quantities=$this->db->get('item_units')->result_array();
}else{
$unit_quantities=[];
}
$unit_qty_map=[];

foreach($unit_quantities as $uq)$unit_qty_map[$uq['item_id'].'_'.$uq['unit_id']]=$uq['quantity_per_unit'];
$grand_total_available=0;
foreach($all_item_category_array as $cat):
$category_name=$categories_map[$cat['category_id']]??'Unknown';
echo '<tr><td colspan="9"><strong style="font-size:16px">'.$category_name.'</strong></td></tr>';
$order_items_array_po=$items_by_cat[$cat['category_id']]??[];
$total_stock_available=0;
$stock_available=0;
$item_quantity_po=0;
$total_quantity_po=0;
$quantity_in_stock_po=0;
$os_total=0;
$purchase_total=0;
$total_total=0;
$sales_total=0;
$transfer_total=0;
$cs_total=0;



foreach($order_items_array_po as $item_po):

$item_id=$item_po['item_id'];
$item_name_po=$items_map[$item_id]??'Unknown';
$sup_id=$supplier_map[$item_id]??0;
$supplier_name_po=$suppliers_map[$sup_id]??'Unknown';
$stock_data=$stock_by_item[$item_id]??null;
if(!$stock_data)continue;
$date_po=date('d-m-Y',$stock_data['date_timestamp']);
$opening_stock_=$stock_data['opening_stock'];
$stock_in_today_=$stock_data['stock_in_today']??0;
$item_quantity_po+=$opening_stock_;
$stock_available+=($opening_stock_+$stock_in_today_);
$total_q_sold=$pwg_by_item[$item_id]??0;
$total_q_transfer=$transfers_by_item[$item_id]??0;
$closing_stock=$stock_available-$total_q_sold-$total_q_transfer;
$calculated_closing_stock=$closing_stock;
if(strtotime($to)==strtotime('today'))$closing_stock=$items_qty_map[$item_id]??0;
$units_data=$units_by_item[$item_id]??[];
$units_qty_agg=[];
foreach($units_data as $ud){
if(!isset($units_qty_agg[$ud['unit_id']]))$units_qty_agg[$ud['unit_id']]=0;
$units_qty_agg[$ud['unit_id']]+=$ud['quantity'];
}

if($stock_data):
?>
<tr style="border-bottom:1px solid #b2acac;<?=$calculated_closing_stock==$closing_stock?'':'background-color:#f05353'?>">
<td align="left"><?=$date_po?></td>
<td align="left"><?=$item_name_po?>
<?php
$unit_to_package_t=0;
if(count($units_qty_agg)>0):
foreach($units_qty_agg as $unit_id=>$unit_quantity_t){
$unit_name_t=$unit_names_map[$unit_id]??'Unknown';
$unit_total_t=$unit_qty_map[$item_id.'_'.$unit_id]??1;
if($unit_quantity_t>$unit_total_t){
$unit_to_package_t+=$unit_quantity_t/$unit_total_t;
}else{
$unit_to_package_t=$unit_quantity_t;
}
?>
<div class="row"><span style="background:#ffc107;color:#212529;padding:3px;border-radius:9px"><?=$unit_quantity_t.' '.$unit_name_t?></span></div>
<?php
}
endif;
?>
<?=$calculated_closing_stock==$closing_stock?'':'<small><em>Error: Closing stock mismatch</em></small>'?>
</td>
<td align="right"><?=number_format($item_quantity_po,0,'.',',')?></td>
<td align="right"><?=number_format($stock_in_today_,0,'.',',')?></td>
<td align="right"><?=number_format(($item_quantity_po+$stock_in_today_),0,'.',',')?></td>
<td align="right"><?=number_format($total_q_sold,0,'.',',')?></td>
<td align="right"><?=number_format($total_q_transfer,0,'.',',')?></td>
<td align="right"><?=$unit_to_package_t<$unit_total_t?round(($total_q_sold+$total_q_transfer),2):round(($total_q_sold+$total_q_transfer+$unit_to_package_t),2)?></td>
<td align="right"><?=$unit_to_package_t<$unit_total_t?round($closing_stock,2):round($closing_stock-$unit_to_package_t,2)?></td>
</tr>
<?php
$os_total+=$item_quantity_po;
$total_stock_available+=$stock_available;
$purchase_total+=$stock_in_today_;
$total_total+=($item_quantity_po+$stock_in_today_);
$sales_total+=$total_q_sold;
$cs_total+=$closing_stock;
$transfer_total+=$total_q_transfer;
$item_quantity_po=0;
$stock_available=0;
endif;
endforeach;
$items_count=!empty($order_items_array_po)?count(array_filter($order_items_array_po,function($i)use($stock_by_item){return isset($stock_by_item[$i['item_id']]);})):0;
?>
<tr>
<td colspan="2"></td>
<td align="right" style="border-top:1px solid #000"><strong><?=number_format($os_total,0,'.',',')?></strong></td>
<td align="right" style="border-top:1px solid #000"><strong><?=number_format($purchase_total,0,'.',',')?></strong></td>
<td align="right" style="border-top:1px solid #000"><strong><?=number_format($total_total,0,'.',',')?></strong></td>
<td align="right" style="border-top:1px solid #000"><strong><?=number_format($sales_total,0,'.',',')?></strong></td>
<td align="right" style="border-top:1px solid #000"><strong><?=number_format($transfer_total,0,'.',',')?></strong></td>
<td align="right" style="border-top:1px solid #000"><strong><?=number_format(($sales_total+$transfer_total),0,'.',',')?></strong></td>
<td align="right" style="border-top:1px solid #000"><strong><?=round($cs_total,2)?></strong></td>
</tr>
<?php
$grand_total_available+=$total_quantity_po;
$total_quantity_po=0;
endforeach;
if($items_count<1)echo'<tr><td colspan="10" align="center" style="color:red">No Data Found!</td></tr>';
?>
<tr><td colspan="8"></td><td></td></tr>
</tbody>
</table>
</div>
<footer class="footer" style="position:fixed;bottom:-35px">
<div style="width:100%;height:30px;margin-bottom:20px;padding:5px;text-align:left"><smal style="color:#1d1c1c;text-shadow:1px 1px 0 #504949;position:relative;top:5px"><i>Software Developed & Designed by: Lightworld Technologies Ltd. Contact us on 0243618186 | 0247612799 or email us on mail@lightworldtech.com</i></smal></div>
</footer>
</div></div>
</page>
</div></div></div>
</div>
