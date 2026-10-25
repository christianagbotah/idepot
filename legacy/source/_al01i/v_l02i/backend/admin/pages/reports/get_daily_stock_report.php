<?php
$ts=strtotime($from);
$settings=$this->db->where_in('type',['currency','system_name','address','phone'])->get('settings')->result_array();
$s=array_column($settings,'description','type');
$exact_date=true;
if($from==0){
$this->db->select('date_timestamp')->from('sales_order')->order_by('date_timestamp','asc')->limit(1);
$from=date('d-m-Y',$this->db->get()->row()->date_timestamp);
if($from==''){
$this->db->select('date_timestamp')->from('purchase_order')->order_by('date_timestamp','asc')->limit(1);
$from=date('d-m-Y',$this->db->get()->row()->date_timestamp);
}
}else{
$this->db->where('date_timestamp',$ts)->limit(1);
if($this->db->get('stock_manager')->num_rows()==0){
$this->db->where('date_timestamp <=',$ts)->order_by('stock_id','desc')->limit(1);
$from=date('d-m-Y',$this->db->get('stock_manager')->row()->date_timestamp);
$exact_date=false;
}}
$ts=strtotime($from);
if($category_id[0]==''&&sizeof($category_id)==1||$category_id[0]==''&&sizeof($category_id)==0){
$cats=$this->db->select('category_id')->from('items')->distinct()->get()->result_array();
}else{
$cats=$this->db->select('category_id')->from('items')->where_in('category_id',$category_id)->distinct()->get()->result_array();
}
$cat_ids=array_column($cats,'category_id');
$all_cats=$this->db->where_in('category_id',$cat_ids)->get('item_category')->result_array();
$cats_map=array_column($all_cats,'category_name','category_id');
$all_items=$this->db->where_in('category_id',$cat_ids)->get('items')->result_array();
$items_by_cat=[];
$items_map=[];
foreach($all_items as $i){
$items_by_cat[$i['category_id']][]=$i;
$items_map[$i['item_id']]=$i;
}
$item_ids=array_column($all_items,'item_id');
$this->db->where('date_timestamp',$ts);
if($user_id!='')$this->db->where('user_id',$user_id);
$stock=$this->db->get('stock_manager')->result_array();
$stock_map=[];
foreach($stock as $st)$stock_map[$st['item_id']]=$st;
$this->db->select('item_id,type_of_sales,SUM(quantity_picked)as qty')->where('date_timestamp',$ts);
if($user_id!='')$this->db->where('sales_person_id',$user_id);
$this->db->where('opening_entry',0)->where_in('item_id',$item_ids)->group_by(['item_id','type_of_sales']);
$sales=$this->db->get('payment_with_goods')->result_array();
$sales_map=[];
foreach($sales as $sl)$sales_map[$sl['item_id']][$sl['type_of_sales']]=$sl['qty'];
$this->db->select('item_id,SUM(quantity)as qty')->where('date_timestamp',$ts);
if($user_id!='')$this->db->where('sales_person_id',$user_id);
$this->db->where_in('item_id',$item_ids)->group_by('item_id');
$trans=$this->db->get('items_transfers')->result_array();
$trans_map=array_column($trans,'qty','item_id');
$this->db->select('item_id,MAX(timestamp)as ts')->where('date_timestamp',$ts)->where_in('item_id',$item_ids)->group_by('item_id');
$pwg_ts=$this->db->get('payment_with_goods')->result_array();
$pwg_ts_map=array_column($pwg_ts,'ts','item_id');
$this->db->select('item_id,MAX(timestamp)as ts')->where('date_timestamp',$ts)->where_in('item_id',$item_ids)->group_by('item_id');
$it_ts=$this->db->get('items_transfers')->result_array();
$it_ts_map=array_column($it_ts,'ts','item_id');
$bal_map=[];
foreach($item_ids as $iid){
$pwg_t=$pwg_ts_map[$iid]??0;
$it_t=$it_ts_map[$iid]??0;
if($pwg_t>1&&$it_t>1){
if($pwg_t>$it_t){
$this->db->where('timestamp',$pwg_t)->where('item_id',$iid);
$bal_map[$iid]=$this->db->get('payment_with_goods')->row()->item_balance;
}else{
$this->db->where('timestamp',$it_t)->where('item_id',$iid);
$bal_map[$iid]=$this->db->get('items_transfers')->row()->item_balance;
}}}
?>
<style>.alert{padding:5px;border-radius:10px;border:none;background-color:#d0a107;color:#ffe52c}#mark_print th,#grade_table th,#conducts th{padding:5px;color:#000;border-bottom:2px solid #e2dddd}#invoice_table thead tr th{color:#fff!important}#invoice_table thead{padding:10px 0!important}pre{display:block;font-family:monospace;white-space:pre-wrap;margin:-40px 0;line-height:20px}body{font-size:14px!important}.account_tb th{background-color:grey;border:1px solid #e2dddd;padding:5px;color:#fff;border-bottom:1px solid red;text-align:left}td{padding:5px}#grade_table tbody tr td{line-height:25px}#term{background-color:#000;padding:5px 15px;border-radius:9px;font-size:24px;letter-spacing:5px;color:#fff}div .logo{position:absolute;margin-top:20px;left:10px}div .photo_passport{position:absolute;margin-top:-100px;right:10px;border-radius:16% 6%}page[size="A4"]{width:21cm;height:29.7cm;page-break-after:always}#print_div a{background-color:#000;color:#fff;padding:5px;border-radius:14px;font-size:15px;font-weight:bold}#print_div a:hover{background-color:green;color:#fff}.footer{position:relative;bottom:0}#promote{position:absolute;margin-top:-32px}#status{position:relative;margin-top:-120px;transform:rotate(-45deg)}@media Print{.footer{position:fixed;bottom:0}page{background:#fff;display:block;margin:0 auto;margin-bottom:.5cm;box-shadow:0}#order_summary{width:80%!important}#invoice_table,#hr_line,#top_row,.footer{width:130%!important}pre{display:block;font-family:monospace;white-space:pre-wrap;margin:-40px 0;line-height:20px}page[size="A4"]{width:21cm;height:29.7cm;page-break-after:always}body,page{margin:0;box-shadow:0}#print_div{display:none}div .logo{position:absolute;margin-top:20px;left:10px}div .photo_passport{position:absolute;margin-top:-75px!important;right:10px}#top_row{margin-top:-15px}#student_details p{line-height:30px}#promote{margin-top:-32px}#box{margin-top:-10px}#gh{margin-top:-15px}.sign{position:fixed;bottom:5px}}</style>
<link rel="stylesheet" href="<?=base_url('assets/css/chartjs/dist/Chart.min.css')?>"/>
<script src="<?=base_url('assets/css/chartjs/dist/Chart.min.js')?>"></script>
<script src="<?=base_url('assets/js/jquery-3.3.1.min.js')?>"></script>
<div class="container">
<div class="row" style="margin-top:15px;position:fixed;right:5px;z-index:9999" id="print_div">
<a href="javascript:void(0);" onClick="print()">PRINT STOCK REPORT</a>
</div>
<div class="row"><div class="col-lg-12"><div id="print">
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
<tr><td align="right"></td><td align="right"><strong>DATE: <?=$from?></strong></td></tr>
<tr style="border-top:2px solid #1b1b69"><td colspan="2"></td></tr>
</thead>
</table>
</td>
</tr>
</tbody>
</table>
</center>
<div class="row"><div class="col-lg-12 col-md-12">
<?=!$exact_date?'<div class="alert alert-danger">This is not for the exact date you selected because we found out that no transaction happened on that day. We tried further to fetch just the <strong>last day</strong> with transactions nearer to your selected date.</div>':''?>
<div class="table table-responsive">
<table class="table table-hover active table-bordered table-striped" id="invoice_table" style="width:100%;border-collapse:collapse;margin-top:10px" border="1">
<thead style="background-color:#4242ad;padding:30px">
<tr style="height:30px">
<th style="text-align:left;padding:0 3px">Item</th>
<th style="text-align:right;padding:0 3px">Opening Stock</th>
<th style="text-align:right;padding:0 3px">Supply</th>
<th style="text-align:right;padding:0 3px">Available Stock</th>
<th width="600">
<table class="table table-hover active table-bordered table-striped" style="width:100%;border-collapse:collapse;margin-top:10px" border="1">
<thead>
<tr><th colspan="5" style="letter-spacing:5px">CEMENTS OUT</th></tr>
<tr>
<th width="120" style="text-align:right;padding:0 3px">Cash Sales</th>
<th width="120" style="text-align:right;padding:0 3px">Credit Sales</th>
<th width="120" style="text-align:right;padding:0 3px">Deposit Taken</th>
<th width="120" style="text-align:right;padding:0 3px">Transfer</th>
<th width="120" style="text-align:right;padding:0 3px">Total Cements Out</th>
</tr>
</thead>
</table>
</th>
<th style="text-align:right;padding:0 3px">Closing Stock</th>
</tr>
</thead>
<tbody>
<tr style="border-bottom:1px solid #000"><td align="left" colspan="10"><h3 style="text-align:left">TOTAL ORDER AVAILABLE</h3></td></tr>
<?php
foreach($cats as $cat):
$cn=$cats_map[$cat['category_id']]??'Unknown';
echo'<tr id="category_id_'.$cat['category_id'].'"><td colspan="9"><strong style="font-size:16px">'.$cn.'</strong></td></tr>';
$items=$items_by_cat[$cat['category_id']]??[];
$has_data=false;
foreach($items as $it){
if(!isset($stock_map[$it['item_id']]))continue;
$has_data=true;
break;
}
if(!$has_data){
echo'<script>$(function(){$("#category_id_'.$cat['category_id'].'").remove();});</script>';
continue;
}
$os_t=$pur_t=$tot_t=$cash_t=$cred_t=$dep_t=$out_t=$tr_t=$cs_t=0;
foreach($items as $it):
$st=$stock_map[$it['item_id']]??null;
if(!$st)continue;
$os=$st['opening_stock'];
$si=$st['stock_in_today']??0;
$av=$os+$si;
$cash=$sales_map[$it['item_id']]['Cash']??0;
$cred=$sales_map[$it['item_id']]['Receivables']??0;
$dep=$sales_map[$it['item_id']]['Payables']??0;
$tr=$trans_map[$it['item_id']]??0;
$out=$cash+$cred+$dep+$tr;
$exp_cs=$av-$out;
$act_cs=$bal_map[$it['item_id']]??$exp_cs;
?>
<tr>
<td align="left"><?=$it['item_name']?></td>
<td align="right"><?=number_format($os,0,'.',',')?></td>
<td align="right"><?=number_format($si,0,'.',',')?></td>
<td align="right"><strong><?=number_format($av,0,'.',',')?></strong></td>
<td width="600">
<table class="table table-hover active table-bordered table-striped" style="width:100%;border-collapse:collapse;margin-top:10px">
<tbody>
<tr>
<td width="120" align="right" style="border-right:1px solid #000"><?=number_format($cash,0,'.',',')?></td>
<td width="120" align="right" style="border-right:1px solid #000"><?=number_format($cred,0,'.',',')?></td>
<td width="120" align="right" style="border-right:1px solid #000"><?=number_format($dep,0,'.',',')?></td>
<td width="120" align="right" style="border-right:1px solid #000"><?=number_format($tr,0,'.',',')?></td>
<td width="120" align="right" style="border-right:1px solid #000"><strong><?=number_format($out,0,'.',',')?></strong></td>
</tr>
</tbody>
</table>
</td>
<td align="right"><?=$act_cs==$exp_cs?'<strong>'.number_format($exp_cs,0,'.',',').'</strong>':'<div class="alert alert-danger"><p>Expected:</p>'.number_format($exp_cs,0,'.',',').'<p>Actual:</p>'.number_format($act_cs,0,'.',',').'</div>'?></td>
</tr>
<?php
$os_t+=$os;$pur_t+=$si;$tot_t+=$av;$cash_t+=$cash;$cred_t+=$cred;$dep_t+=$dep;$out_t+=$out;$tr_t+=$tr;$cs_t+=$act_cs;
endforeach;
?>
<tr>
<td></td>
<td align="right" style="border-top:1px solid #000"><strong><?=number_format($os_t,0,'.',',')?></strong></td>
<td align="right" style="border-top:1px solid #000"><strong><?=number_format($pur_t,0,'.',',')?></strong></td>
<td align="right" style="border-top:1px solid #000"><strong><?=number_format($tot_t,0,'.',',')?></strong></td>
<td width="600">
<table class="table table-hover active table-bordered table-striped" style="width:100%;border-collapse:collapse;margin-top:10px">
<tbody>
<tr>
<td width="120" align="right" style="border-top:1px solid #000"><strong><?=number_format($cash_t,0,'.',',')?></strong></td>
<td width="120" align="right" style="border-top:1px solid #000"><strong><?=number_format($cred_t,0,'.',',')?></strong></td>
<td width="120" align="right" style="border-top:1px solid #000"><strong><?=number_format($dep_t,0,'.',',')?></strong></td>
<td width="120" align="right" style="border-top:1px solid #000"><strong><?=number_format($tr_t,0,'.',',')?></strong></td>
<td width="120" align="right" style="border-top:1px solid #000"><strong><?=number_format($out_t,0,'.',',')?></strong></td>
</tr>
</tbody>
</table>
</td>
<td align="right" style="border-top:1px solid #000"><strong><?=number_format($cs_t,0,'.',',')?></strong></td>
</tr>
<?php endforeach;?>
<tr><td colspan="6"></td></tr>
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
<script>function print_page(){print();}$(function(){setTimeout(()=>{print_page();},1000);});</script>
