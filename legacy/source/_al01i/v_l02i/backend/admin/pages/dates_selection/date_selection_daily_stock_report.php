<style type="text/css">
    
    #daily_stock .btn {
        border-radius: 0px !important;
        height: 4.4rem !important;
    }

    #daily_stock .btn:hover { 
        box-shadow: 0 0.3rem 8rem 0 rgba(0, 0, 0, 0.4) !important;
    }

    .select2-container--classic .select2-selection--multiple {
        height: 45px !important;
    }
</style>

<?php
///get current user's name
  $level = $this->db->get_where('admin', array('admin_id' => $this->session->userdata('login_user_id')))->row()->level;

echo form_open(site_url('admin/daily_stock_report'),
	array('class' => 'form-horizontal form-groups-bordered', 'id' => 'daily_stock', 'target' => '_blank')); ?>

<div class="card shadow mt-3">
    <div class="card-body">
             
        <div class="form-group row">
            <div class="col-sm-12 col-md-12" style="margin-bottom: 20px">
                <div class="input-group">
                    <div class="input-group-prepend">
                        <div class="input-group-text bg-primary text-light">Item Categories</div>
                    </div>
                    <select class="form-control select2 col-sm-12 col-md-12" multiple="" name="search_by_category[]" id="ds_search_by_category">
                        <option value="">All</option>
                        <?php

                        $category_array = $this->db->get('item_category')->result_array();

                        
                        foreach($category_array as $cat):
                            echo '<option value="'.$cat['category_id'].'">'.$cat['category_name'].'</option>';
                        endforeach;
                        ?>
                    </select>
                </div>
            </div>

            <div class="col-sm-4 col-md-4">
                <div class="input-group">
                    <div class="input-group-prepend">
                        <div class="input-group-text bg-info text-light">Period</div>
                    </div>
                    <select class="form-control" name="search_by_periods" id="search_by_periods">
                        <option value="2">Today</option>
                        <option value="3">Yesterday</option>
                        <option value="10">Custom Date</option>
                    </select>
                </div>
            </div>

            <div class="col-sm-8 col-md-8">
                <div class="input-group">
                    <div class="input-group-prepend">
                        <div class="input-group-text bg-info text-light">Cashier</div>
                    </div>
                    <select class="form-control" name="search_by_cashier" id="search_by_cashier">
                        <option value="">All</option>
                        <?php

                        if($level == 3) {
                            $cashier_array = $this->db->get_where('admin', array('level' => 3, 'admin_id' => $this->session->userdata('login_user_id')))->result_array();

                        } else {
                            $cashier_array = $this->db->get_where('admin', array('level' => 3))->result_array();
                        }
                        
                        foreach($cashier_array as $cashier):
                            echo '<option value="'.$cashier['admin_id'].'">'.$cashier['name'].'</option>';
                        endforeach;
                        ?>
                    </select>
                </div>
            </div>
        </div>

        <div class="form-group row">
            <div class="col-sm-6 col-md-6">
                <div class="input-group">
                    <div class="input-group-prepend">
                        <div class="input-group-text bg-dark text-light">Date:</div>
                    </div>
                    <input type="text" name="from" id="from" readonly="readonly" class="form-control datepicker" data-format="dd-mm-yyyy" value="<?php echo date('d-m-Y'); ?>">
                </div><hr>
                <div><span id="from_view" class="text-muted"><?=date('l F d, Y'); ?></span></div>
            </div>

            <div class="col-sm-3 col-md-3">
                <button type="submit" class="btn btn-info btn-lg form-control">Load</button>
            </div>
            <div class="col-sm-3 col-md-3">
                <button class="btn btn-danger btn-lg form-control" data-dismiss="modal">Cancel</button>

            </div>
            <!-- <div class="col-sm-6 col-md-6">
                <div class="input-group">
                    <div class="input-group-prepend">
                        <div class="input-group-text bg-dark text-light">To</div>
                    </div>
                    <input type="text" name="to" id="to" readonly="readonly" class="form-control datepicker" data-format="dd-mm-yyyy" value="<?php //echo date('d-m-Y'); ?>">
                </div><hr>
                <div><strong id="to_view"><?//=date('l F d, Y'); ?></strong></div>
            </div> -->
        </div>

    </div>
</div>

</form>

<script type="text/javascript">
    $(function() {
        selection_controller();
    });

    $('#search_by_periods').change(function(event) {
        selection_controller();

        let date_value = $('#search_by_periods').val();

        $.ajax({
            url: '<?php echo site_url('admin/get_selected_dates/') ?>' + date_value,
            type: 'POST',
            dataType: 'json',
            cache: false
            //data: {param1: 'value1'},
        })
        .done(function(data) {
            //response is ready
            $('#from').val(data.from);
           // $('#to').val(data.to);

            //view update
            $('#from_view').html(data.from_view);
            //$('#to_view').html(data.to_view);
        });
    });

    $('#from').change(function(event) {
        /* Act on the event */
        let date_val = $('#from').val().split('-');
        let d = date_val[0];
        let m = date_val[1];
        let y = date_val[2];

        const date = new Date(y + '-' + m + '-' + d);
        $('#from_view').html(date.toDateString());
    });

    $('#from').keyup(function(event) {
        /* Act on the event */
        let date_val = $('#from').val().split('-');
        let d = date_val[0];
        let m = date_val[1];
        let y = date_val[2];

        const date = new Date(y + '-' + m + '-' + d);
        $('#from_view').html(date.toDateString());
    });

    

    function selection_controller() {
        /* Act on the event */
        if($('#search_by_periods').val() == 10) {
            $('#from').removeAttr('readonly');
            //$('#to').removeAttr('readonly');
        } else {

            $('#from').attr('readonly', 'readonly');
            //$('#to').attr('readonly', 'readonly');
        }
    }

    $('#daily_stock').submit(function(event) {
        /* Act on the event */
        //window.location.reload();
    });
</script>