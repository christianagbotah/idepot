
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

        <style type="text/css">
            #page_preloader {
                padding-top: 150px;
                position:  fixed;
                top: 0;
                bottom: 0;
                left: 0;
                right: 0;
                z-index: 99999;
                
            }

            #page_preloader h3 {
                color: #000;
            }
        </style>

    </head>
    <body>  

        <div id="data-holder">
            <div id="page_preloader">
                <center>
                    <div style="margin-bottom: 10px">
                        <?=get_spinner_image();?>
                    </div>
                    <h3>Please wait. Page is being loaded...</h3>
                </center>
            </div>
        </div>
    

    <script type="text/javascript" src="<?php echo base_url('assets/js/jquery-3.3.1.min.js'); ?>"></script>
    <script type="text/javascript" src="<?php echo base_url('assets/js/bootstrap.js'); ?>"></script>
</body>
</html>    
    
<script type="text/javascript">
    jQuery(document).ready(function($)
    {
        //called to update the crsf name and key
         $.ajaxSetup({
            cache: false,
            data: {
                '<?php echo $this->security->get_csrf_token_name(); ?>': '<?php echo $this->security->get_csrf_hash(); ?>'
            } 
         }); 
      //  var elem = $('#print');
        //PrintElem(elem);
        //Popup(data);
        loadData()// load page data
    });

    function loadData() {
        $.ajax({
            url: '<?=site_url("admin/backlog_report/0/0/yes/"); ?>',
            type: 'POST',
            dataType: 'json',
            data: {
                'from': '<?=$from;?>',
                'to': '<?=$to;?>',
                'search_by_cashier': '<?=$user_id;?>',
                'search_by_category[]': <?=json_encode($category_id);?>,
            },
            cache: false
        })
        .done(function(response) {
            $('#data-holder').html(response.page_html_data);

            setTimeout(() => {
              print_page(); //call print page automatically
            }, 1000);
        })
        .fail(function(err) {
            $('#data-holder').html(err.responseText);
        })
    }
    

   
 function PrintElem(elem)
    {
        Popup($(elem).html());
    }

    function Popup(data)
    {
        var mywindow = window.open('', '', '');
        mywindow.document.write('<!doctype html><html><head><title>BACKLOG ACCOUNT</title>');
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
              //print_page();
            }, 1000);
            
        });
</script>

