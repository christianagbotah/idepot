<link rel="stylesheet" href="<?=base_url('node_modules/flowbite/dist/flowbite.css')?>">
<link rel="stylesheet" href="<?php echo base_url('assets/css/app.v1.css');?>">
<link rel="stylesheet" href="<?php echo base_url('assets/css/switch-buttons.css');?>">
<link rel="stylesheet" href="<?php echo base_url('assets/js/jquery-ui/css/no-theme/jquery-ui-1.10.3.custom.min.css');?>">
<link rel="stylesheet" href="<?php echo base_url('assets//js/jquery-ui/css/jquery-ui.css');?>">
<link rel="stylesheet" href="<?php echo base_url('assets/css/font-icons/entypo/css/entypo.css');?>">
<link href="https://fonts.googleapis.com/css?family=Open+Sans:400,700" rel="stylesheet">
<link rel="stylesheet" href="<?php echo base_url('assets/css/neon-core.css');?>">
<link rel="stylesheet" href="<?php echo base_url('assets/css/neon-theme.css');?>">
<link rel="stylesheet" href="<?php echo base_url('assets/css/neon-forms.css');?>">
<link rel="stylesheet" href="<?php echo base_url('assets/css/custom.css');?>">
<link rel="stylesheet" href="<?php echo base_url('assets/css/bootstrap.css');?>">
<link rel="stylesheet" href="<?php echo base_url('assets/css/responsive_table.css');?>">
<link href="https://fonts.googleapis.com/css?family=Orbitron&display=swap" rel="stylesheet">
<link rel="stylesheet" href="<?php echo base_url('assets/fonts/Orbitron/Orbitron.css');?>">

<!--<link rel="stylesheet" href="<?php echo base_url('assets/js/select2/select2-bootstrap.css');?>">-->
<link rel="stylesheet" href="<?php echo base_url('assets/js/select2/select2.min.css');?>">
<link rel="stylesheet" href="<?php echo base_url('assets/js/selectboxit/jquery.selectBoxIt.css');?>">
<link rel="stylesheet" href="<?php echo base_url('assets/tailwindcss/output.css');?>">



<!--LINKS FOR BOOTSTRAP 4 TEMPLATE-->
<!-- Custom fonts for this template-->
  <link href="<?php echo base_url('assets/bootstrap4-theme/vendor/fontawesome-free/css/all.min.css'); ?>" rel="stylesheet" type="text/css">
  <link href="https://fonts.googleapis.com/css?family=Nunito:200,200i,300,300i,400,400i,600,600i,700,700i,800,800i,900,900i" rel="stylesheet">

  <!-- Custom styles for this template-->
  <link href="<?php echo base_url('assets/bootstrap4-theme/css/sb-admin-2.css'); ?>" rel="stylesheet">


 <!-- DataTables -->
  <link href="<?php echo base_url('assets/bootstrap4-theme/vendor/datatables/dataTables.bootstrap4.min.css'); ?>" rel="stylesheet">
  <!--LINKS FOR BOOTSTRAP 4 TEMPLATE ENDS-->

<?php
    $skin_colour = $this->db->get_where('settings' , array(
        'type' => 'skin_colour'
    ))->row()->description;
    if ($skin_colour != ''):?>
    <!--<link rel="stylesheet" href="<?php echo base_url('assets/css/skins/' . $skin_colour . '.css');?>"> -->

<?php endif;?>

<?php if ($text_align == 'right-to-left') : ?>
    <link rel="stylesheet" href="<?php echo base_url('assets/css/neon-rtl.css');?>">
<?php endif; ?>


        <!--[if lt IE 9]><script src="assets/js/ie8-responsive-file-warning.js"></script><![endif]-->

<!-- HTML5 shim and Respond.js IE8 support of HTML5 elements and media queries -->
<!--[if lt IE 9]>
        <script src="https://oss.maxcdn.com/libs/html5shiv/3.7.0/html5shiv.js"></script>
        <script src="https://oss.maxcdn.com/libs/respond.js/1.4.2/respond.min.js"></script>
<![endif]-->
<link rel="shortcut icon" href="<?php echo base_url('uploads/school_logo.png');?>">
<link rel="stylesheet" href="<?php echo base_url('assets/login_page/css/font-awesome.min.css');?>">
<link rel="stylesheet" href="<?php echo base_url('assets/css/font-icons/font-awesomenew/css/fontawesome.min.css');?>">

<link rel="stylesheet" href="<?php echo base_url('assets/js/vertical-timeline/css/component.css');?>">


<link rel="stylesheet" type="text/css" href="<?php echo base_url('assets/datatable/buttons/css/buttons.bootstrap.css');?>"/>

<link rel="stylesheet" href="<?php echo base_url('assets/js/wysihtml5/bootstrap-wysihtml5.css');?>">

<link rel="stylesheet" type="text/css" href="<?php echo base_url('assets/css/chartjs/dist/Chart.min.css');?>"/>
<!-- <link rel="stylesheet" type="text/css" href="<?php echo base_url('assets/chartist/dist/chartist.min.css');?>"/>
<link rel="stylesheet" type="text/css" href="<?php echo base_url('assets/chartist-plugin-tooltips/dist/chartist-plugin-tooltip.css');?>"/>
<link rel="stylesheet/less" type="text/css" href="<?php echo base_url('assets/chartist-plugin-tooltips/dist/chartist-plugin-legend.less');?>"/> -->

<?php include 'styles.php'; ?>

<style>
    .form-check-inline .form-check-input {
        width: 20px !important;
        height: 20px !important;
        cursor: pointer;
    }
</style>

<!-- <script src="<?php echo base_url('assets/chartist-plugin-tooltips/dist/less.min.js');?>" type="text/javascript"></script> -->

<!--for bootstrap select-->
<link rel="stylesheet" type="text/css" href="<?php echo base_url('assets/bootstrap-select/css/bootstrap-select.css');?>"/>
<script src="<?php echo base_url('assets/bootstrap-select/js/bootstrap-select.js');?>" type="text/javascript"></script>




<!--FontAwesome-->
<script src="https://kit.fontawesome.com/740651ba2c.js" crossorigin="anonymous"></script>


<!--Chartjs-->
<script src="<?php echo base_url('assets/css/chartjs/dist/Chart.min.js');?>" type="text/javascript"></script>

<!--number_format-->
<script src="<?php echo base_url('assets/js/number_format.js');?>" type="text/javascript"></script>

<!--numeric_format-->
<script src="<?php echo base_url('assets/js/numeric_format.js');?>" type="text/javascript"></script>

<!--getTh --function for getting dates-->
<script src="<?php echo base_url('assets/js/getThe.js');?>" type="text/javascript"></script>

<!--jQuery-->
<script src="<?php echo base_url('assets/js/jquery-3.4.1.js');?>" type="text/javascript"></script>
<script src="<?php echo base_url('assets/js/jquery-ui/js/jquery-ui.js');?>"></script>





<script>
    function checkDelete()
    {
        var chk=confirm("Are You Sure You Want To Delete This?");
        if(chk)
        {
          return true;
        }
        else{
            return false;
        }
    }
</script>

<style>
    button {
        border-radius: 10px !important;
    }
</style>
