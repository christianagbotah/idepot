
<!doctype html>
<html>
<head>
<title><?=$page_title?></title>
<link rel="stylesheet" href="<?=base_url('assets/css/font-icons/entypo/css/entypo.css.min.css')?>"/>
<link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Noto+Sans:400,700,400italic"/>
<link rel="stylesheet" href="<?=base_url('assets/css/chartjs/dist/Chart.min.css')?>"/>
<link rel="stylesheet" href="<?=base_url('assets/bootstrap4-theme/vendor/datatables/dataTables.bootstrap4.min.css')?>"/>
<link rel="shortcut icon" href="<?=base_url('uploads/school_logo.png')?>">
<style>#page_preloader{padding-top:150px;position:fixed;top:0;bottom:0;left:0;right:0;z-index:99999}#page_preloader h3{color:#000}</style>
</head>
<body>
<div id="data-holder">
<div id="page_preloader"><center><div style="margin-bottom:10px"><?=get_spinner_image()?></div><h3>Please wait. Page is being loaded...</h3></center></div>
</div>
<script src="<?=base_url('assets/js/jquery-3.3.1.min.js')?>"></script>
<script src="<?=base_url('assets/js/bootstrap.js')?>"></script>
<script src="<?=base_url('assets/bootstrap4-theme/vendor/datatables/jquery.dataTables.min.js')?>"></script>
<script src="<?=base_url('assets/bootstrap4-theme/vendor/datatables/dataTables.bootstrap4.min.js')?>"></script>
<script src="<?=base_url('assets/datatable/buttons/js/dataTables.buttons.js')?>"></script>
<script src="<?=base_url('assets/datatable/buttons/js/buttons.bootstrap.js')?>"></script>
<script src="<?=base_url('assets/css/chartjs/dist/Chart.min.js')?>"></script>
<script>
$(function(){
$.ajaxSetup({cache:false,data:{'<?=$this->security->get_csrf_token_name()?>':'<?=$this->security->get_csrf_hash()?>'}});
$('#invoice_table').DataTable();
$.ajax({
url:'<?=site_url("admin/daily_stock_report/0/0/yes/")?>',
type:'POST',
dataType:'json',
data:{'from':'<?=$from?>','search_by_cashier':'<?=$user_id?>','search_by_category[]':<?=json_encode($category_id)?>},
cache:false
}).done(function(r){
$('#data-holder').html(r.page_html_data);
setTimeout(print,1000);
}).fail(function(e){
$('#data-holder').html(e.responseText);
});
});
</script>
</body>
</html>

