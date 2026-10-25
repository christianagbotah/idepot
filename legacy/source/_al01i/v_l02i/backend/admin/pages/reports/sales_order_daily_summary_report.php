<!doctype html>
<html>
<head>
<title><?=$page_title?></title>
<link rel="stylesheet" href="<?=base_url('assets/css/font-icons/entypo/css/entypo.css')?>"/>
<link rel="stylesheet" href="http://fonts.googleapis.com/css?family=Noto+Sans:400,700,400italic"/>
<link rel="stylesheet" href="<?=base_url('assets/css/chartjs/dist/Chart.min.css')?>"/>
<link rel="shortcut icon" href="<?=base_url('uploads/school_logo.png')?>">
<link href="<?=base_url('assets/bootstrap4-theme/vendor/fontawesome-free/css/all.min.css')?>" rel="stylesheet">
<link href="<?=base_url('assets/tailwindcss/output.css')?>" rel="stylesheet">
<script src="<?=base_url('assets/js/jquery-3.4.1.js')?>"></script>
<script src="//cdn.rawgit.com/rainabba/jquery-table2excel/1.1.0/dist/jquery.table2excel.min.js"></script>
</head>
<body>
<div id="main-holder" class="m-auto">
<center>
<div style="position:absolute;top:38vh;left:46vw">
<h3 style="color:black">Please Wait...<i class="fa fa-spinner fa-pulse"></i></h3>
<h4 class="text-gray-500">Loading your page</h4>
</div>
</center>
</div>
<script src="<?=base_url('assets/js/bootstrap.js')?>"></script>
<script src="<?=base_url('assets/bootstrap4.4.1/js/bootstrap.min.js')?>"></script>
<script>
$(function(){
$.ajaxSetup({cache:false,data:{'<?=$this->security->get_csrf_token_name()?>':'<?=$this->security->get_csrf_hash()?>'}});
$.ajax({
url:'<?=site_url('admin/getDailySalesOrderReport/'.$from.'/'.$to.'/'.$customer_id.'/'.$status.'/'.$type_of_sales.'/'.$item_id)?>',
type:'post',
dataType:'html',
cache:false
}).done(function(data){
$('#main-holder').html(data);
}).fail(function(err){
$('#main-holder').html('<div class="bg-red-400 p-3 w-4/12 rounded-lg ring-1 ring-red-200 text-white"><strong>Something happened and your data was not loaded:</strong></div><br/>'+err.responseText);
});
});
</script>
</body>
</html>
