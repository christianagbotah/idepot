
<!doctype html>
<html>
    <head>
        <title><?=$page_title; ?></title>
        <link rel="stylesheet" href="<?php echo base_url('assets/css/font-icons/entypo/css/entypo.css.min.css'); ?>"/>
        <link rel="stylesheet" href="http://fonts.googleapis.com/css?family=Noto+Sans:400,700,400italic"/>
        <link rel="stylesheet" type="text/css" href="<?php echo base_url('assets/css/chartjs/dist/Chart.min.css');?>"/>
        <link rel="shortcut icon" href="<?php echo base_url('uploads/school_logo.png');?>">


        <link href="<?php echo base_url('assets/bootstrap4-theme/vendor/fontawesome-free/css/all.min.css'); ?>" rel="stylesheet" type="text/css">

       

        <!--jQuery-->
<script src="<?php echo base_url('assets/js/jquery-3.4.1.js');?>" type="text/javascript"></script>

        <!--Chartjs-->
        <script src="<?php echo base_url('assets/css/chartjs/dist/Chart.min.js');?>" type="text/javascript"></script>

    </head>
    <body>  

        <div id="content-holder">
            <center>
                <div style="position: absolute; top: 38vh; left: 46vw;">
                  <h3 style="color: black">Please Wait...<i class="fa fa-spinner fa-pulse"></i></h3>
                  <h4 class="text-gray-500">Loading your page</h4>
                </div>
            </center>
        </div>
</body>
</html>    
    
<script type="text/javascript">
    
    $(function(ev) {
        //called to update the crsf name and key
         $.ajaxSetup({
            cache: false,
            data: {
                '<?php echo $this->security->get_csrf_token_name(); ?>': '<?php echo $this->security->get_csrf_hash(); ?>'
            } 
         }); 

        loadPage();
    })

    function loadPage() {

        $.ajax({
            url: '<?php echo site_url('admin/getStockMarginWeeklyReport/'.$to.'/'.$periods.'/'.$category_id);?>',
            type: 'post',
            dataType: 'html',
            cache: false,
        })
        .done(function(data) {

            $('#content-holder').html(data);

        })
        .fail(function(err) {
            $('#content-holder').html('<center style="margin-top: 45vh"><h4 class="text-red-300">Failed to load report. Please try again later!</h4><br/>' + err.responseText + '</center>');
        });
    }
</script>

