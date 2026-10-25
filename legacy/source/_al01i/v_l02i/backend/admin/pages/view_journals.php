
<style type="text/css">
    #top_tab .nav-link {
        color: blue !important;
    }

    #top_tab .nav-link:hover {
        color: red !important;
    }

    #top_tab .nav-link:focus {
        background: #36b9cc  !important;
        color: #ffff !important;
    }
</style>
<div class="container-fluid">
    <div class="row">
            <div class="col-md-1 col-sm-1 col-lg-1"><button class="btn btn-outline-warning btn-lg" id="soprint"><i class="fa fa-2x fa-fw fa-print"></i></button><br><strong class="ml-3">Print</strong></div>
    </div>

    <hr>
     <?php
     //currency
    $currency = $this->db->get_where('settings', array('type' => 'currency'))->row()->description;
    $fmt = new NumberFormatter('en_US', NumberFormatter::CURRENCY);

    //use get method to retrieve the values of from and to
    if(isset($_GET['from']) && isset($_GET['to'])) {
        $from = $_GET['from'];
        $to = $_GET['to'];
    }

       echo form_open(site_url('admin/journal_search') ,
        array('class' => 'form-horizontal form-groups-bordered','target'=>'_top')); ?>
    <div class="form-group row gap-3">
        <div class="col-sm-2 col-md-2">
            <div class="input-group">
                <div class="input-group-prepend">
                    <div class="input-group-text bg-success text-light">Period</div>
                </div>
                <select class="form-control" name="search_by_periods" id="search_by_periods">
                    <option value="1">All</option>
                    <option value="2">Today</option>
                    <option value="3">Yesterday</option>
                    <option value="4" selected>This Week</option>
                    <option value="5">Last Week</option>
                    <option value="6">This Month</option>
                    <option value="7">Last Month</option>
                    <option value="8">This Year</option>
                    <option value="9">Last Year</option>
                    <option value="10">Custom Date</option>>
                </select>
            </div>
        </div>

        <div class="col-sm-2 col-md-2">
            <div class="input-group">
                <div class="input-group-prepend">
                    <div class="input-group-text bg-dark text-light">Start</div>
                </div>
                <input type="text" name="from" id="from" class="form-control datepicker" data-format="dd-mm-yyyy" value="<?php echo $from; ?>">
            </div>
        </div>
        <div class="col-sm-2 col-md-2">
            <div class="input-group">
                <div class="input-group-prepend">
                    <div class="input-group-text bg-dark text-light">End</div>
                </div>
                <input type="text" name="to" id="to" class="form-control datepicker" data-format="dd-mm-yyyy" value="<?php echo $to; ?>">
            </div>
        </div>

        <div class="col-sm-4 col-md-4">
            <div class="input-group">
                <div class="input-group-prepend">
                    <div class="input-group-text bg-info text-light">Account</div>
                </div>
                <select class="form-control select2" name="search_by_account" id="search_by_account">
                    <option value="0">All</option>
                    <?php
                    $accounts = $this->db->get('accounts')->result_array();

                    foreach($accounts as $acc):

                        ?>
                        <option value="<?=$acc['account_id']; ?>"><?=$acc['name']; ?></option>
                        <?php
                    endforeach;
                    ?>
                    
                </select>
            </div>
        </div>
    </div>
    </form>
    <hr>

    <div class="row">
      <div class="col-md-12 col-sm-12" id="top_tab">
        <!-- Main Header Tab Navs-->
        <ul class="nav nav-tabs" id="nav_tabs">
          <li class="nav-item" id="all_tab2">
            <a href="#tab11" data-toggle="tab" class="nav-link active"><?php echo get_phrase('all'); ?>
            </a>
          </li>
          <li class="nav-item" id="general_tab2">
            <a href="#tab22" data-toggle="tab" class="nav-link"><?php echo get_phrase('general'); ?>
            </a>
          </li>
          <li class="nav-item" id="payments_tab2">
            <a href="#tab33" data-toggle="tab" class="nav-link"><?php echo get_phrase('payments'); ?>
            </a>
          </li>
          <li class="nav-item" id="receipts_tab2">
            <a href="#tab44" data-toggle="tab" class="nav-link"><?php echo get_phrase('receipts'); ?>
            </a>
          </li>
          <li class="nav-item" id="sales_tab2">
            <a href="#tab55" data-toggle="tab" class="nav-link"><?php echo get_phrase('sales'); ?>
            </a>
          </li>
          <li class="nav-item" id="purchases_tab2">
            <a href="#tab66" data-toggle="tab" class="nav-link"><?php echo get_phrase('purchases'); ?>
            </a>
          </li>
        </ul>    
      </div> 
    </div>
<hr>
    <div class="row">
        <div class="col-md-12 col-sm-12">
            <div class="nav-item tab-content" id="journal_tab_content">
                <!--All tab-->
                <div class="tab-pane active" id="tab11">

                </div>

                <!--General tab-->
                <div class="tab-pane" id="tab22">
                    
                </div>

                <!--Payments tab-->
                <div class="tab-pane" id="tab33">
                    
                </div>

                <!--Receipts tab-->
                <div class="tab-pane" id="tab44">
                    
                </div>

                <!--Sales tab-->
                <div class="tab-pane" id="tab55">
                    
                </div>

                <!--Purchase tab-->
                <div class="tab-pane" id="tab66">
                    
                </div>

            </div>
        </div>
    </div>
</div>

<script type="text/javascript">
    

   
    //FILTERING DATA
    $(function() {
        selection_controller();
        journal_list_filter();
    });


    $('#nav_tabs .nav-item a').click(function(event) {
        let t_id = $(this).attr('href').substr(1);

        journal_list_filter(t_id);      
    });


    //by date
    $('#search_by_periods').change(function(event) {
        selection_controller();
        journal_list_filter();      
    });


    //by status
    $('#search_by_account').change(function(event) {
        journal_list_filter();      
    });

    $('#from').change(function(event) {
        /* Act on the event */
        journal_list_filter();
    });

    $('#from').keyup(function(event) {
        /* Act on the event */
        journal_list_filter();
    });

    $('#to').change(function(event) {
        /* Act on the event */
        journal_list_filter();
    });

    $('#to').keyup(function(event) {
        /* Act on the event */
        journal_list_filter();
    });

    //filtering of order list
    function journal_list_filter(tab_id_received) {
        let date_value = $('#search_by_periods').val();
        let account_id = $('#search_by_account').val();
        let tab_id = '';

        if(tab_id_received == undefined) {

            tab_id = $('#journal_tab_content').children('.active').attr('id');
        } else {
           tab_id = tab_id_received;
        }
        

        let id = tab_id;

        if(tab_id == 'tab11') {
            tab_id = 'all';

        } else if(tab_id == 'tab22') {
            tab_id = 'General';

        } else if(tab_id == 'tab33') {
            tab_id = 'Payments';
            
        } else if(tab_id == 'tab44') {
            tab_id = 'Receipts';
            
        } else if(tab_id == 'tab55') {
            tab_id = 'Sales';
            
        } else if(tab_id == 'tab66') {
            tab_id = 'Purchases';
            
        } 

        if(date_value == 10) {
                //response is ready
                //$('#from').val('<?=date('d-m-Y') ?>');
                //$('#to').val('<?=date('d-m-Y') ?>');

                //view update
                let from = $('#from').val();
                let to = $('#to').val();


                $.ajax({
                    url: '<?php echo site_url('admin/get_all_journal/')  ?>' + from + '/' + to + '/' + account_id + '/' + tab_id,
                    type: 'POST',
                    dataType: 'html',
                    cache: false,
                })
                .done(function(data) {
                    //change view now
                    $('#'+ id).slideDown('slow');
                    $('#'+ id).html(data);
                }) 
                fail(function(er) {
                    alert(er);
                });
                
        } else if (date_value == 1) {
            //no date selected

            let from = 0;
            let to = 0;

            $.ajax({
                url: '<?php echo site_url('admin/get_all_journal/')  ?>' + from + '/' + to + '/' + account_id + '/' + tab_id,
                type: 'POST',
                dataType: 'html',
                cache: false,
            })
            .done(function(data) {
                //change view now
                $('#'+ id).slideDown('slow');
                $('#'+ id).html(data);
            });

        } else {
            $.ajax({
            url: '<?php echo site_url('admin/get_selected_dates/') ?>' + date_value,
            type: 'POST',
            dataType: 'json',
            cache: false,
            //data: {param1: 'value1'},
            })
            .done(function(data) {
                //response is ready
                $('#from').val(data.from);
                $('#to').val(data.to);

                //view update
                let from = data.from;
                let to = data.to;

                $.ajax({
                    url: '<?php echo site_url('admin/get_all_journal/')  ?>' + from + '/' + to + '/' + account_id + '/' + tab_id,
                    type: 'POST',
                    dataType: 'html',
                    cache: false,
                })
                .done(function(data) {
                    //change view now
                    $('#'+ id).slideDown('slow');
                    $('#'+ id).html(data);
                });
                
            });
        } 
    }

    function selection_controller() {
        /* Act on the event */
        if($('#search_by_periods').val() == 10) {
            $('#from').removeAttr('disabled');
            $('#to').removeAttr('disabled');
        } else {

            $('#from').attr('disabled', 'disabled');
            $('#to').attr('disabled', 'disabled');
        }
    }

    $(function() {
        $('.journal_table').DataTable();
    });
</script>


