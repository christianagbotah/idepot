<?php
$settings=$this->db->where_in('type',['currency','system_name','address','phone'])->get('settings')->result_array();
$s=array_column($settings,'description','type');
if($from==0&&$to==0){
$this->db->select('date_timestamp')->from('payment_with_goods')->order_by('date_timestamp','asc')->limit(1);
$from=date('d-m-Y',$this->db->get()->row()->date_timestamp);
$to=date('d-m-Y');
}
$startDate=date_create($from);
$endDate=date_create($to);
$diff=date_diff($startDate,$endDate);
$numDays=intVal($diff->format('%a'));
$daysHolder=array($from);
for($i=1;$i<=$numDays;$i++)$daysHolder[]=date('d-m-Y',strtotime($from.' + '.$i.' days'));
$firstDate=$daysHolder[0];
$lastDate=$daysHolder[sizeof($daysHolder)-1];
$this->db->select_max('date_timestamp')->from('stock_manager')->where('date_timestamp <=',strtotime($firstDate));
$startTimestamp=$this->db->get()->row()->date_timestamp;
$this->db->select_max('date_timestamp')->from('stock_manager')->where('date_timestamp <=',strtotime($lastDate));
$endTimestamp=$this->db->get()->row()->date_timestamp;
$this->db->select_sum('amount')->where('timestamp BETWEEN "'.strtotime($from).'" AND "'.strtotime($to).'"')->where('payment_type','Receivable');
$totalReceived=$this->db->get('payment')->row()->amount;
$this->db->select('category_id')->from('items');
if($item_id!=0)$this->db->where('item_id',$item_id);
$this->db->distinct();
$all_cats=$this->db->get()->result_array();
$cat_ids=array_column($all_cats,'category_id');
$cats_map=$this->db->where_in('category_id',$cat_ids)->get('item_category')->result_array();
$cats_map=array_column($cats_map,'category_name','category_id');
$this->db->select('item_id,category_id,item_name,item_sold_in_units')->where_in('category_id',$cat_ids);
if($item_id!=0)$this->db->where('item_id',$item_id);
$all_items=$this->db->get('items')->result_array();
$items_by_cat=[];
$items_map=[];
foreach($all_items as $it){
$items_by_cat[$it['category_id']][]=$it;
$items_map[$it['item_id']]=$it;
}
$item_ids=array_column($all_items,'item_id');
$this->db->select('item_id,date_timestamp,opening_stock,closing_stock,stock_in_today')->where_in('item_id',$item_ids)->where('date_timestamp BETWEEN "'.strtotime($from).'" AND "'.strtotime($to).'"');
$stock_data=$this->db->get('stock_manager')->result_array();
$stock_map=[];
foreach($stock_data as $sd)$stock_map[$sd['item_id']][$sd['date_timestamp']]=$sd;
$this->db->select('item_id,date_timestamp,SUM(quantity_picked)as qty,SUM(quantity_picked)as qty_unit,order_item_has_unit_sales,unit_id')->where_in('item_id',$item_ids)->where('date_timestamp BETWEEN "'.strtotime($from).'" AND "'.strtotime($to).'"')->where('opening_entry',0);
if($status!='All')$this->db->where('status',$status);
$this->db->group_by(['item_id','date_timestamp','order_item_has_unit_sales']);
$sales_data=$this->db->get('payment_with_goods')->result_array();
$sales_map=[];
$sales_unit_map=[];
foreach($sales_data as $sl){
if($sl['order_item_has_unit_sales']==0){
$sales_map[$sl['item_id']][$sl['date_timestamp']]=($sales_map[$sl['item_id']][$sl['date_timestamp']]??0)+$sl['qty'];
}else{
$sales_unit_map[$sl['item_id']][$sl['date_timestamp']]=($sales_unit_map[$sl['item_id']][$sl['date_timestamp']]??0)+$sl['qty_unit'];
}}
$this->db->select('item_id,date_timestamp,SUM(quantity)as qty')->where_in('item_id',$item_ids)->where('date_timestamp BETWEEN "'.strtotime($from).'" AND "'.strtotime($to).'"')->group_by(['item_id','date_timestamp']);
$trans_data=$this->db->get('items_transfers')->result_array();
$trans_map=[];
foreach($trans_data as $tr)$trans_map[$tr['item_id']][$tr['date_timestamp']]=($trans_map[$tr['item_id']][$tr['date_timestamp']]??0)+$tr['qty'];
$daysArraySize=sizeof($daysHolder);
$colSpan=$daysArraySize+8;
foreach($daysHolder as $d){
if(date('l',strtotime($d))=='Sunday')$colSpan-=1;
}
?>
<style>#mark_print th,#grade_table th,#conducts th{padding:5px;color:#000;border-bottom:2px solid #e2dddd}#invoice_table thead tr th{color:#fff!important}#invoice_table thead{padding:10px 0!important}pre{display:block;font-family:monospace;white-space:pre-wrap;margin:-40px 0;line-height:20px}body{font-size:14px!important}.account_tb th{background-color:grey;border:1px solid #e2dddd;padding:5px;color:#fff;border-bottom:1px solid red;text-align:left}td{padding:5px}#grade_table tbody tr td{line-height:25px}#term{background-color:#000;padding:5px 15px;border-radius:9px;font-size:24px;letter-spacing:5px;color:#fff}div .logo{position:absolute;margin-top:20px;left:10px}div .photo_passport{position:absolute;margin-top:-100px;right:10px;border-radius:16% 6%}page[size="A4"]{width:21cm;height:29.7cm;page-break-after:always}#print_div a{background-color:#000;color:#fff;padding:5px;border-radius:14px;font-size:15px;font-weight:bold}#print_div a:hover{background-color:green;color:#fff}.footer{position:fixed;bottom:0}#promote{position:absolute;margin-top:-32px}#status{position:relative;margin-top:-120px;transform:rotate(-45deg)}@media Print{.footer{position:fixed;bottom:0}page{background:#fff;display:block;margin:0 auto;margin-bottom:.5cm;box-shadow:0}#order_summary{width:130%!important}#invoice_table,#hr_line,#top_row,.footer{width:130%!important}pre{display:block;font-family:monospace;white-space:pre-wrap;margin:-40px 0;line-height:20px}page[size="A4"]{width:21cm;height:29.7cm;page-break-after:always}body,page{margin:0;box-shadow:0}#print_div{display:none}div .logo{position:absolute;margin-top:20px;left:10px}div .photo_passport{position:absolute;margin-top:-75px!important;right:10px}#top_row{margin-top:-15px}#student_details p{line-height:30px}#promote{margin-top:-32px}#box{margin-top:-10px}#gh{margin-top:-15px}.sign{position:fixed;bottom:5px}}</style>
<link rel="stylesheet" href="<?=base_url('assets/css/chartjs/dist/Chart.min.css')?>"/>
<script src="<?=base_url('assets/css/chartjs/dist/Chart.min.js')?>"></script>
<div class="container-fluid">
<div class="row" style="margin-top:15px;position:fixed;right:5px;z-index:9999" id="print_div">
<a href="javascript:void(0);" onClick="print()">Print</a>
</div>
<div class="row"><div class="col-lg-12"><div id="print">
<page size="A4" style="page-break-before:always">
<center>
<table class="table table-bordered table-striped" id="top_row" style="width:100%;border-collapse:collapse;margin-top:10px">
<tbody>
<tr>
<td width="50%">
<table class="table table-bordered table-striped" style="margin-top:-10px;border-collapse:collapse">
<thead>
<tr>
<td><img src="<?=base_url()?>uploads/school_logo.png" style="max-height:80px"></td>
<td><h3 class="mb-4" style="font-weight:bold;font-size:20px;letter-spacing:2px"><?=$s['system_name']?></h3>
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
<tr style="border-top:2px solid #1b1b69"><td colspan="2"></td></tr>
<tr style="border-top:2px solid #1b1b69"><td colspan="2" align="right">Printed On: <?=date('d-m-Y H:i:s')?></td></tr>
</thead>
</table>
</td>
</tr>
</tbody>
</table>
</center>
<div class="row"><div class="col-lg-12 col-md-12">
<table class="table table-bordered table-striped" id="order_summary" style="width:100%;border-collapse:collapse;margin-top:10px">
<caption><h2 style="text-align:left">SUPPLY SUMMARY</h2></caption>
<thead style="background-color:#cecece;padding:30px">
<tr style="height:30px">
<th style="text-align:left;padding:0 5px">S/N</th>
<th style="text-align:left;padding:0 5px">ITEM/PRODUCT</th>
<th style="text-align:left;padding:3px 5px;background:#e7e0e0"><center>OS<br/><div style="font-size:14px"><?=date('D, d-m',$startTimestamp)?></div></center></th>
<th style="text-align:center;padding:3px 5px;background:#e7e0e0">PURCH</th>
<?php
for($d=0;$d<$daysArraySize;$d++){
if(date('l',strtotime($daysHolder[$d]))=='Sunday')continue;
if($daysArraySize>7):
?><th style="text-align:left;padding:0 5px"><center><div><?=date('D',strtotime($daysHolder[$d]))?></div><br/><div style="margin-top:-15px"><?=date('d-m',strtotime($daysHolder[$d]))?></div></center></th>
<?php else:?>
<th style="text-align:left;padding:0 5px"><center><div><?=date('l',strtotime($daysHolder[$d]))?></div><br/><div style="margin-top:-15px"><?=$daysHolder[$d]?></div></center></th>
<?php endif;}?>
<th style="text-align:center;padding:0 5px">TOTAL<br/><span class="text-xs">GOODS OUT</th>
<th style="text-align:left;padding:3px 5px;background:#e7e0e0"><center>CS<br/><div style="font-size:14px"><?=date('D, d-m',$endTimestamp)?></div></center></th>
<th style="text-align:right;padding:3px 5px">Remarks</th>
</tr>
</thead>
<tbody>
<?php
foreach($all_cats as $cat):
$cateTotal=0;
$cn=$cats_map[$cat['category_id']]??'Unknown';
echo'<tr id="this_'.$cat['category_id'].'" style="background:#dfdfdf"><td colspan="'.$colSpan.'"><strong style="font-size:13px">'.$cn.'</strong></td></tr>';
$items=$items_by_cat[$cat['category_id']]??[];
$sn=1;
foreach($items as $it):
$openingStock=$stock_map[$it['item_id']][$startTimestamp]['opening_stock']??0;
$closingStock=$stock_map[$it['item_id']][$endTimestamp]['closing_stock']??0;
if(strtotime('today')==strtotime($to)&&$closingStock==0)$closingStock=$this->db->get_where('items',['item_id'=>$it['item_id']])->row()->quantity;
$goodsIn=0;
$weeklyTotalItemPicked=0;
$weeklyTotalItemPickedInUnit=0;
$stableUnitName='';
foreach($daysHolder as $day){
$ts=strtotime($day);
$goodsIn+=($stock_map[$it['item_id']][$ts]['stock_in_today']??0);
$qPicked=$sales_map[$it['item_id']][$ts]??0;
$qTrans=$trans_map[$it['item_id']][$ts]??0;
$weeklyTotalItemPicked+=($qPicked+$qTrans);
$weeklyTotalItemPickedInUnit+=($sales_unit_map[$it['item_id']][$ts]??0);
}
if($goodsIn==0&&strtotime($from)<$items_map[$it['item_id']]['timestamp']){
$this->db->select_sum('quantity')->from('purchase_order')->where('item_id',$it['item_id'])->where('date_timestamp BETWEEN "'.strtotime($from).'" AND "'.strtotime($to).'"');
$goodsIn=$this->db->get()->row()->quantity;
}
$startRow='<tr id="item_row_'.$it['item_id'].'" style="border-bottom:1px solid #000"><td>'.$sn.'</td><td>'.$it['item_name'].'</td><td align="center"><strong style="border-radius:50%;padding:5px;background:#e7e0e0">'.number_format($openingStock,0,'.',',').'</strong></td><td align="center"><strong style="border-radius:50%;padding:5px;background:#e7e0e0">+'.number_format($goodsIn,0,'.',',').'</strong></td>';
echo $startRow;
foreach($daysHolder as $day){
if(date('l',strtotime($day))=='Sunday')continue;
$ts=strtotime($day);
$qPicked=$sales_map[$it['item_id']][$ts]??0;
$qTrans=$trans_map[$it['item_id']][$ts]??0;
$sum_of_item_out=$qPicked+$qTrans;
$itemQuantitySoldInUnitPicked=$sales_unit_map[$it['item_id']][$ts]??0;
echo'<td align="center">'.number_format($sum_of_item_out,0,'.',',').'<br/>'.($itemQuantitySoldInUnitPicked>0?'<mark>Unit: </mark>'.number_format($itemQuantitySoldInUnitPicked,0,'.',','):'').'</td>';
}
echo'<td align="right"><strong>'.number_format($weeklyTotalItemPicked,0,'.',',').'<br/>'.($weeklyTotalItemPickedInUnit>0?'<mark>Unit: </mark>'.number_format($weeklyTotalItemPickedInUnit,0,'.',','):'').'</strong></td>';
echo'<td align="center"><strong style="border-radius:50%;padding:5px;background:#e7e0e0">'.number_format($closingStock,0,'.',',').'</strong></td>';
echo'<td align="center" width="50"></td></tr>';
if($weeklyTotalItemPicked==0&&$weeklyTotalItemPickedInUnit==0){
echo'<script>$("#item_row_'.$it['item_id'].'").remove();</script>';
}
$cateTotal+=($weeklyTotalItemPicked+$weeklyTotalItemPickedInUnit);
$sn++;
endforeach;
if($cateTotal==0)echo'<script>$("#this_'.$cat['category_id'].'").remove();</script>';
endforeach;
?>
<tr class="pt-20"><td></td></tr>
<tr class="pt-20">
<td align="right" class="font-bold" colspan="<?=$colSpan-2?>">TOTAL CASH RECEIVED</td>
<td align="right" class="font-bold"><?=$s['currency'].number_format($totalReceived,2,'.',',')?></td>
</tr>
</tbody>
</table>
<footer class="footer" style="position:fixed;bottom:0">
<div style="text-align:left"><smal style="color:#a3a1a1"><i>Software Developed & Designed by: Lightworld Technologies Ltd. Contact us on 0243618186 | 0247612799 or email us on mail@lightworldtech.com</i></smal></div>
</footer>
</div></div>
</page>
</div></div></div>
<script src="<?=base_url('assets/js/jquery-3.3.1.min.js')?>"></script>
<script>function print_page(){print();}$(function(){setTimeout(()=>{print_page();},1000);});</script>
