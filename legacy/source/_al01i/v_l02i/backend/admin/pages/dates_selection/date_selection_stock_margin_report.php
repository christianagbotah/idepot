<style type="text/css">
    .btn {
        border-radius: 8px;
        height: 30px;
    }
    .select2-selection__choice {
        font-size: 11px !important;
    }
</style>

<?php

    echo '<script src="'. base_url(). 'assets/js/neon-custom-ajax.js"></script>
    <script type="text/javascript">

      $(function() {
        $(".select2").select2({
          theme: "classic"
          });
        
      })
      
    </script>';

    $months = [
        'january',
        'february',
        'march',
        'april',
        'may',
        'june',
        'july',
        'august',
        'september',
        'october',
        'november',
        'december'
    ];

///get current user's name
  $level = $this->db->get_where('admin', array('admin_id' => $this->session->userdata('login_user_id')))->row()->level;

echo form_open(site_url('admin/stock_margin_report/'),
    array('class' => 'form-horizontal form-groups-bordered', 'id' => 'stock_margin_form', 'target' => '_blank')); ?>
    <div class="form-group row">
        <div class="col-sm-6 col-md-6">
            <label class="form-label col-sm-12 col-md-12 bg-secondary rounded-lg text-light">Periods</label>

            <select class="form-control col-sm-12 col-md-12 select2" name="search_by_periods" id="search_by_periods">
                <option value="d">Daily</option>
                <option value="w">Weekly</option>
                <option value="m">Monthly</option>
            </select>

        </div>
        <div class="col-sm-6 col-md-6">
                <label class="form-label col-sm-12 col-md-12 bg-secondary rounded-lg text-light">Category</label>

                <select class="form-control select2 col-sm-12 col-md-12" multiple="" required name="search_by_category[]" id="search_by_category">
                    <option value="0">All</option>
                    <?php

                    $category_array = $this->db->get('item_main_category')->result_array();

                    
                    foreach($category_array as $cat):
                        echo '<option value="'.$cat['category_id'].'">'.$cat['category_name'].'</option>';
                    endforeach;
                    ?>
                </select>
        </div>
    </div>

    <div class="form-group row">
        <div class="col-sm-6 col-md-6">
                <?php
                    $start_year = $this->crud_model->getFirstSalesYear();
                    $current_year = date('Y');

                    $duration = $current_year - $start_year;
                ?>

                <select class="form-control select2" name="year" id="year">
                    <option>Select Year</option>
                    <?php
                    
                    for($i = 0; $i <= $duration; $i++):
                        $year = $start_year + $i; ?>

                        <option value="<?=$year;?>" <?=$year == $current_year ? 'selected' : ''; ?>><?=$year;?></option>

                        <?php
                    endfor;
                    ?>
                </select>
                <hr>
            
        </div>

        <div class="col-sm-6 col-md-6" id="date_holder">
            <input type="text" name="date_view" class="form-control" value="<?=date('l F d, Y'); ?>">
        </div>
    </div>

    <div class="d-flex flex-row mt-3">
        <div style="margin-right: 10px;">
            <button type="submit" class="btn btn-info btn-lg"><strong>Load</strong></button>
        </div>
        <div>
            <a class="btn btn-danger btn-lg" data-dismiss="modal"><strong>Cancel</strong></a>
        </div>
    </div>
</form>

<a target="_blank" id="page_loader"></a>

<script type="text/javascript">
    $(function() {
       updatePeriodSelection();
    });

    $('#search_by_periods').change(function(event) {

        updatePeriodSelection();
        
    });

    function updatePeriodSelection() {

        let date_value = $('#search_by_periods').val();

        $('#select2-year-container').css({
                color: '#444 !important',
                backgroundColor: '#fff !important'
            });

        if(date_value == 'd') {
            //daily selected
            $('#date_holder').html('<input type="date" name="date_view" class="form-control" value="<?=date('l F d, Y'); ?>">');
            $('#year').attr('disabled', 'disabled');
            $('#select2-year-container').css({
                color: '#e7dcdc !important',
                backgroundColor: '#dadada !important'
            });

        } else if(date_value == 'm') {
            //monthly selected
            $('#year').removeAttr('disabled');

            $('#date_holder').html('<select class="form-control select2" name="date_view"><option>Select Month</option><?php for($i = 0; $i < sizeof($months); $i++):?><option value="<?=$months[$i];?>" <?=ucwords($months[$i]) == date('F') ? 'selected' : ''; ?>><?=ucwords($months[$i]);?></option><?php endfor;?></select>');

        } else if(date_value == 'w') {
            //weekly selected
            $('#date_holder').html('<input type="week" name="date_view" class="form-control" value="">');
            $('#year').attr('disabled', 'disabled');
            $('#select2-year-container').css({
                color: '#e7dcdc !important',
                backgroundColor: '#dadada !important'
            });

        } else {
            //unknown selection
        }
    }


    $('#to').change(function(event) {
        /* Act on the event */
        let date_val = $('#to').val().split('-');
        let d = date_val[0];
        let m = date_val[1];
        let y = date_val[2];

        const date = new Date(y + '-' + m + '-' + d);
        $('#to_view').val(date.toDateString());
    });

    $('#to').keyup(function(event) {
        /* Act on the event */
        let date_val = $('#to').val().split('-');
        let d = date_val[0];
        let m = date_val[1];
        let y = date_val[2];

        const date = new Date(y + '-' + m + '-' + d);
        $('#to_view').val(date.toDateString());
    });

    function selection_controller() {
        /* Act on the event */
        if($('#search_by_periods').val() == 10) {
            //$('#from').removeAttr('readonly');
            $('#to').removeAttr('readonly');
        } else {

            //$('#from').attr('readonly', 'readonly');
            $('#to').attr('readonly', 'readonly');
        }
    }

    $('#stock_margin_form').submit(function(event) {
        /* Act on the event */
        event.preventDefault();

        $('#modal_confirm').css({
            zIndex: 9999,
        });

        showAjaxModal_confirm('Please wait... <i class="fa fa-spinner fa-pulse"></i>', 'Loading'); //show loading

        let formUrl = $(this).attr('action');

        $.ajax({
            url: formUrl,
            type: 'post',
            dataType: 'json',
            data: new FormData(this),
            contentType: false,
            processData: false,
            cache: false,

        })
        .done(function(response) {

            if(response.status == 'success') {

                $('#page_loader').attr('href', '<?=site_url('admin/stock_margin_report/1/');?>' + response.periods + '/' + response.category_id + '/' + response.to + '/' + response.year);

                showAjaxModal_confirm(response.message, 'Success');


               setTimeout(() => {
                   $('.close').click();
                   $('#date_selection .btn-danger').click();//close the modals
                
                  $('#page_loader')[0].click();

               }, 3000);

            } else {

                //error
                $(function(ev) {
                    $.each(response, function(index, val) {
                        $('#err_thrower').append('<li>' + val + '</li>');
                    })
                });

                showAjaxModal_confirm('<ul id="err_thrower"></ul>', 'Error');
            }

        })
        .fail(function(err) {

            showAjaxModal_confirm(err.responseText, 'Error'); 
        })
       // window.location.reload();
       $('.close').click();
    });
</script>