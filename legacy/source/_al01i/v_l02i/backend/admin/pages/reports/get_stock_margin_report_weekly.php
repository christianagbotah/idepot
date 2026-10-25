<?php
$explode_week=explode('-',$to);
$week_year=$explode_week[0];
$week_number=$explode_week[1];
$week=$week_year.$week_number;
$week_first_date=strtotime($week);
$week_last_date=strtotime($week.' + 5 days');
if($to==0)$to=date('d-m-Y');
$settings=$this->db->where_in('type',['currency','system_name','address','phone'])->get('settings')->result_array();
$s=array_column($settings,'description','type');
$fmt=new NumberFormatter('en_US',NumberFormatter::CURRENCY);
if($category_id[0]=='0'||empty($category_id)){
$main_cats=$this->db->get('item_main_category')->result_array();
}else{
$this->db->where_in('category_id',$category_id);
$main_cats=$this->db->get('item_main_category')->result_array();
}
$main_cat_ids=array_column($main_cats,'category_id');
$this->db->where_in('main_id',$main_cat_ids);
$sub_cats=$this->db->get('item_category')->result_array();
$sub_cats_by_main=[];
$sub_cats_map=[];
foreach($sub_cats as $sc){
$sub_cats_by_main[$sc['main_id']][]=$sc;
$sub_cats_map[$sc['category_id']]=$sc['category_name'];
}
$sub_cat_ids=array_column($sub_cats,'category_id');
if(!empty($sub_cat_ids)){
$this->db->where_in('category_id',$sub_cat_ids);
$all_items=$this->db->get('items')->result_array();
}else{
$all_items=[];
}
$items_by_cat=[];
$items_map=[];
foreach($all_items as $it){
$items_by_cat[$it['category_id']][]=$it;
$items_map[$it['item_id']]=$it;
}
$item_ids=array_column($all_items,'item_id');
$this->db->select('item_id,quantity,price,cost_price,type_of_sales,so_code,grand_total,amount_due,order_item_has_unit_sales,unit_id');
$this->db->where('date_timestamp BETWEEN "'.$week_first_date.'" AND "'.$week_last_date.'"');
if(!empty($item_ids))$this->db->where_in('item_id',$item_ids);
$sales=$this->db->get('sales_order')->result_array();
$sales_by_item=[];
foreach($sales as $sl)$sales_by_item[$sl['item_id']][]=$sl;
$so_codes=array_unique(array_column($sales,'so_code'));
$payments_by_so=[];
if(!empty($so_codes)){
$this->db->select('so_code,SUM(amount)as total_paid');
$this->db->where('timestamp BETWEEN "'.$week_first_date.'" AND "'.$week_last_date.'"');
$this->db->where_in('so_code',$so_codes);
$this->db->group_by('so_code');
$payments=$this->db->get('payment')->result_array();
foreach($payments as $p)$payments_by_so[$p['so_code']]=$p['total_paid'];
}
$unit_ids_all=[];
foreach($sales as $sl){
if($sl['order_item_has_unit_sales']==1)$unit_ids_all[$sl['unit_id']]=1;
}
$unit_ids_all=array_keys($unit_ids_all);
$unit_qty_map=[];
if(!empty($unit_ids_all)&&!empty($item_ids)){
$this->db->select('item_id,unit_id,unit_total');
$this->db->where_in('item_id',$item_ids);
$this->db->where_in('unit_id',$unit_ids_all);
$units=$this->db->get('units_items')->result_array();
foreach($units as $u)$unit_qty_map[$u['item_id'].'_'.$u['unit_id']]=$u['unit_total'];
}
$this->db->select_sum('discount');
$this->db->where('discount >','0');
$this->db->where('amount_due','0');
$this->db->where('date_timestamp BETWEEN "'.$week_first_date.'" AND "'.$week_last_date.'"');
$discount=$this->db->get('sales_order')->row()->discount??0;
$grand_total_q=0;
$grand_total_sp=0;
$grand_total_cp=0;
$grand_total_m=0;
$item_no=0;
?>
<style>#mark_print th,#grade_table th,#conducts th{padding:5px;color:#000;border-bottom:2px solid #e2dddd}#invoice_table thead tr th{color:#fff!important}#invoice_table thead{padding:10px 0!important}pre{display:block;font-family:monospace;white-space:pre-wrap;margin:-40px 0;line-height:20px}body{font-size:14px!important}.account_tb th{background-color:grey;border:1px solid #e2dddd;padding:5px;color:#fff;border-bottom:1px solid red;text-align:left}td{padding:5px}#grade_table tbody tr td{line-height:25px}#term{background-color:#000;padding:5px 15px;border-radius:9px;font-size:24px;letter-spacing:5px;color:#fff}div .logo{position:absolute;margin-top:20px;left:10px}div .photo_passport{position:absolute;margin-top:-100px;right:10px;border-radius:16% 6%}page[size="A4"]{width:21cm;height:29.7cm;page-break-after:always}#print_div a{background-color:#000;color:#fff;padding:5px;border-radius:14px;font-size:15px;font-weight:bold}#print_div a:hover{background-color:green;color:#fff}.footer{position:relative;bottom:0}#promote{position:absolute;margin-top:-32px}#status{position:relative;margin-top:-120px;transform:rotate(-45deg)}@media Print{.footer{position:fixed;bottom:0}page{background:#fff;display:block;margin:0 auto;margin-bottom:.5cm;box-shadow:0}#order_summary{width:80%!important}#total_transfer,#invoice_table,#hr_line,#top_row,.footer{width:130%!important}pre{display:block;font-family:monospace;white-space:pre-wrap;margin:-40px 0;line-height:20px}page[size="A4"]{width:21cm;height:29.7cm;page-break-after:always}body,page{margin:0;box-shadow:0}#print_div{display:none}div .logo{position:absolute;margin-top:20px;left:10px}div .photo_passport{position:absolute;margin-top:-75px!important;right:10px}#top_row{margin-top:-15px}#student_details p{line-height:30px}#promote{margin-top:-32px}#box{margin-top:-10px}#gh{margin-top:-15px}.sign{position:fixed;bottom:5px}}</style>
<link rel="stylesheet" href="<?=base_url('assets/css/chartjs/dist/Chart.min.css')?>"/>
<script src="<?=base_url('assets/css/chartjs/dist/Chart.min.js')?>"></script>
<script src="<?=base_url('assets/js/jquery-3.3.1.min.js')?>"></script>
<div class="container">
<div class="row" style="margin-top:15px;position:fixed;right:5px;z-index:9999" id="print_div">
<a href="javascript:void(0);" onClick="print()">PRINT STOCK MARGIN REPORT</a>
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
<tr><td align="right">DATE:</td><td align="right"><strong><?=strtoupper(date('l F, j Y',$week_first_date)).' - '.strtoupper(date('l F, j Y',$week_last_date))?></strong></td></tr>
<tr><td align="right">WEEK#:</td><td align="right"><strong><?=$week_number.' of '.$week_year?></strong></td></tr>
<tr><td align="right">ITEMS#:</td><td align="right"><strong id="item_no"></strong></td></tr>
<tr style="border-top:2px solid #1b1b69"><td colspan="2"></td></tr>
</thead>
</table>
</td>
</tr>
</tbody>
</table>
</center>
<div class="row"><div class="col-lg-12 col-md-12">
<div class="table table-responsive">
<table class="table table-bordered table-striped" id="invoice_table" style="width:100%;border-collapse:collapse;page-break-after:always;margin-top:10px" border="1">
<thead style="background-color:#4242ad;padding:30px">
<tr style="height:30px">
<th style="text-align:left;padding:0 3px">S/N</th>
<th style="text-align:left;padding:0 3px">ITEM</th>
<th style="text-align:right;padding:0 3px">QUANTITY (Q)</th>
<th style="text-align:right;padding:0 3px">SALES (S)</th>
<th style="text-align:right;padding:0 3px">COST (C)</th>
<th style="text-align:right;padding:0 3px">MARGIN (M)</th>
</tr>
</thead>
<tbody>
<tr style="border-bottom:1px solid #000"><td align="left" colspan="6"><h3 style="text-align:left">TOTAL STOCK AVAILABLE</h3></td></tr>
<?php
foreach($main_cats as $mcat):
$main_total_q=0;
$main_total_sp=0;
$main_total_cp=0;
$main_total_m=0;
$main_has_data=false;
echo'<tr id="mcat_'.$mcat['category_id'].'"><td colspan="6"><strong style="font-size:14px">'.$mcat['category_name'].'</strong></td></tr>';
$sub_cats_list=$sub_cats_by_main[$mcat['category_id']]??[];
foreach($sub_cats_list as $cat):
$cat_total_q=0;
$cat_total_sp=0;
$cat_total_cp=0;
$cat_total_m=0;
$cat_has_data=false;
echo'<tr id="cat_'.$cat['category_id'].'"><td colspan="6"><strong style="font-size:16px">'.$sub_cats_map[$cat['category_id']].'</strong></td></tr>';
$items=$items_by_cat[$cat['category_id']]??[];
$sn=1;
foreach($items as $it):
if(!isset($sales_by_item[$it['item_id']]))continue;
$item_total_q=0;
$item_total_sp=0;
$item_total_cp=0;
foreach($sales_by_item[$it['item_id']]as $sale){
if($sale['type_of_sales']=='Receivables'&&$sale['grand_total']==$sale['amount_due']){
$paid=$payments_by_so[$sale['so_code']]??0;
if($paid<$sale['grand_total'])continue;
}
if($sale['order_item_has_unit_sales']==1){
$unit_total=$unit_qty_map[$it['item_id'].'_'.$sale['unit_id']]??1;
$converted_qty=$sale['quantity']/$unit_total;
$item_total_q+=$converted_qty;
$item_total_sp+=$sale['quantity']*$sale['price'];
$item_total_cp+=$converted_qty*$sale['cost_price'];
}else{
$item_total_q+=$sale['quantity'];
$item_total_sp+=$sale['quantity']*$sale['price'];
$item_total_cp+=$sale['quantity']*$sale['cost_price'];
}}
if($item_total_q==0)continue;
$item_total_m=$item_total_sp-$item_total_cp;
$cat_total_q+=$item_total_q;
$cat_total_sp+=$item_total_sp;
$cat_total_cp+=$item_total_cp;
$cat_total_m+=$item_total_m;
$cat_has_data=true;
$item_no++;
?>
<tr>
<td align="left"><?=$sn?></td>
<td align="left"><?=$it['item_name']?></td>
<td align="right"><?=is_decimal($item_total_q)?number_format($item_total_q,2,'.',','):number_format($item_total_q,0,'.',',')?></td>
<td align="right"><?=number_format($item_total_sp,2,'.',',')?></td>
<td align="right"><?=number_format($item_total_cp,2,'.',',')?></td>
<td align="right"><?=number_format($item_total_m,2,'.',',')?></td>
</tr>
<?php
$sn++;
endforeach;
if($cat_has_data):
$avg_m_q=$cat_total_m/$cat_total_q;
$avg_m_s=$cat_total_m/$cat_total_sp;
$avg_m_c=$cat_total_m/$cat_total_cp;
$pct_m_s=($cat_total_m/$cat_total_sp)*100;
$pct_m_c=($cat_total_m/$cat_total_cp)*100;
$main_total_q+=$cat_total_q;
$main_total_sp+=$cat_total_sp;
$main_total_cp+=$cat_total_cp;
$main_total_m+=$cat_total_m;
$main_has_data=true;
?>
<tr>
<td colspan="2">TOTAL</td>
<td align="right" style="border-top:1px solid #000"><strong><?=is_decimal($cat_total_q)?number_format($cat_total_q,2,'.',','):number_format($cat_total_q,0,'.',',')?></strong></td>
<td align="right" style="border-top:1px solid #000"><strong><?=number_format($cat_total_sp,2,'.',',')?></strong></td>
<td align="right" style="border-top:1px solid #000"><strong><?=number_format($cat_total_cp,2,'.',',')?></strong></td>
<td align="right" style="border-top:1px solid #000"><strong><?=number_format($cat_total_m,2,'.',',')?></strong></td>
</tr>
<tr>
<td colspan="2">AVERAGE MARGIN (AM)</td>
<td align="right" style="border-top:1px solid #000"><strong><?=is_decimal($avg_m_q)?number_format($avg_m_q,2,'.',','):number_format($avg_m_q,0,'.',',')?></strong></td>
<td align="right" style="border-top:1px solid #000"><strong><?=number_format($avg_m_s,2,'.',',')?></strong></td>
<td align="right" style="border-top:1px solid #000"><strong><?=number_format($avg_m_c,2,'.',',')?></strong></td>
<td align="right" style="border-top:1px solid #000"></td>
</tr>
<tr>
<td colspan="2">PERCENTAGE AVERAGE MARGIN (AM%)</td>
<td align="right" style="border-top:1px solid #000"><strong></strong></td>
<td align="right" style="border-top:1px solid #000"><strong><?=number_format($pct_m_s,2,'.',',')?>%</strong></td>
<td align="right" style="border-top:1px solid #000"><strong><?=number_format($pct_m_c,2,'.',',')?>%</strong></td>
<td align="right" style="border-top:1px solid #000"></td>
</tr>
<?php else:
echo'<script>$(function(){$("#cat_'.$cat['category_id'].'").remove();});</script>';
endif;
endforeach;
if(!$main_has_data){
echo'<script>$(function(){$("#mcat_'.$mcat['category_id'].'").remove();});</script>';
}else{
$grand_total_q+=$main_total_q;
$grand_total_sp+=$main_total_sp;
$grand_total_cp+=$main_total_cp;
$grand_total_m+=$main_total_m;
}
endforeach;
?>
<tr>
<td colspan="2">GRAND TOTAL MARGIN</td>
<td align="right" style="border-top:1px solid #000"><strong><?=is_decimal($grand_total_q)?number_format($grand_total_q,2,'.',','):number_format($grand_total_q,0,'.',',')?></strong></td>
<td align="right" style="border-top:1px solid #000"><strong><?=number_format($grand_total_sp,2,'.',',')?></strong></td>
<td align="right" style="border-top:1px solid #000"><strong><?=number_format($grand_total_cp,2,'.',',')?></strong></td>
<td align="right" style="border-top:1px solid #000"><strong><?=number_format($grand_total_m,2,'.',',')?></strong></td>
</tr>
<tr>
<td colspan="5">GENERAL DISCOUNT</td>
<td align="right" style="border-top:1px solid #000"><strong>(<?=number_format($discount,2,'.',',')?>)</strong></td>
</tr>
<tr>
<td colspan="5">NET GRAND TOTAL MARGIN</td>
<td align="right" style="border-top:1px solid #000"><strong><?=number_format($grand_total_m-$discount,2,'.',',')?></strong></td>
</tr>
</tbody>
</table>
</div>
<footer class="footer" style="position:fixed;bottom:-35px">
<div style="width:100%;height:30px;margin-bottom:20px;padding:5px;text-align:left"><small style="color:#1d1c1c;text-shadow:1px 1px 0 #504949;position:relative;top:5px"><i>Software Developed & Designed by: Lightworld Technologies Ltd. Contact us on 0243618186 | 0247612799 or email us on mail@lightworldtech.com</i></small></div>
</footer>
</div></div>
</page>
</div></div></div>
</div>
<script src="<?=base_url('assets/js/bootstrap.js')?>"></script>
<script>
function print_page(){print();}
$(function(){
$('#item_no').text('<?=number_format($item_no,0,'.',',')?>');
setTimeout(()=>{print_page();},1000);
});
</script>
