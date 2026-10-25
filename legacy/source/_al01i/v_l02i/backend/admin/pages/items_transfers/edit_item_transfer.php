<?php
$token_number = $param2;

$transfer_query = $this->db->get_where('items_transfers', array('token_no' => $token_number));
$receiver = $this->db->get_where('items_transfers', array('token_no' => $token_number))->row()->receiver;
$date = $this->db->get_where('items_transfers', array('token_no' => $token_number))->row()->date_timestamp;

if ($transfer_query->num_rows() > 0) {

	$transfer_array = $transfer_query->result_array();
	?>


<div class="row">
  <div class="col-md-12 col-sm-12 col-xs-12">
      <div class="panel panel-primary">

          <div class="panel-heading">
              <div class="panel-title" style="color: #fff; padding: 5px;">
                  <?php echo get_phrase('edit_item_transfer'); ?>
              </div>
          </div>


<style type="text/css">
  input[name="amount_paid"] {
    height: 35px !important;
    font-size: 25px !important;
    font-weight: bolder !important;
  }

  input[name="account_balance"], #balance_amount {
    height: 30px !important;
    font-size: 20px !important;
    font-weight: bolder !important;
  }
</style>
<div class="panel-body" style="padding: 10px">
            <?php
echo form_open(site_url('admin/items_transfer/update'),
		array('class' => 'form-groups-bordered', 'id' => 'items_transfer_form', 'target' => '_top')); ?>
            <div class="form-group row">
                <div class="col-sm-4 col-md-4">
                    <div class="input-group">
                        <div class="input-group-prepend">
                            <div class="input-group-text bg-success text-light">Token Number</div>
                        </div>
                    <input type="text" required="true" readonly="readonly" class="form-control" name="token_no" id="token_no"  value="<?=$token_number;?>">
                    </div>
                </div>

                <div class="col-sm-5 col-md-5">
                    <div class="input-group">
                        <div class="input-group-prepend">
                            <div class="input-group-text bg-info text-light">Transfer To:</div>
                        </div>
                        <input type="text" required="true" class="form-control" name="transfer_to" id="transfer_to"  value="<?=$receiver;?>">
                    </div>
                </div>

                <div class="col-sm-3 col-md-3">
                    <div class="input-group">
                        <div class="input-group-prepend">
                            <div class="input-group-text bg-dark text-light">Transfer Date:</div>
                        </div>
                        <input type="text" required="true" class="form-control datepicker" name="transfer_date" id="transfer_date" data-format="dd-mm-yyyy"
                            value="<?php echo date('d-m-Y', $date); ?>">

                        <input type="hidden" class="form-control datepicker" name="transfer_date2"
                            value="<?php echo date('d-m-Y H:i:s'); ?>">
                    </div>
                </div>
            </div>


            <div class="form-group row">
                <table class="table table-striped table-hover table-success" width="100%" id="item_transfer_create_table">
                    <thead>
                      <tr>
                        <th>Quantity</th>
                        <th>Item</th>
                        <th>Description</th>
                        <th>Available Quantity</th>
                        <th>Delete</th>
                      </tr>
                    </thead>
                    <tbody>
                        <?php
$table_row_counter = 1;
	foreach ($transfer_array as $tr):
	?>
                            <tr id="tr_<?=$table_row_counter;?>">
                                <td width="150">
                                <input type="number" min="1" required="true" onkeyup="grand_total($('#quantity_transferred_<?=$tr['html_id'];?>').attr('id').replace(/[^\d]+/, ''))" onchange="grand_total($('#quantity_transferred_<?=$tr['html_id'];?>').attr('id').replace(/[^\d]+/, ''))" class="form-control sum_total_quantity_transferred" id="quantity_transferred_<?=$tr['html_id'];?>" name="quantity_transferred_<?=$tr['html_id'];?>" value="<?=$tr['quantity'];?>">

                                <input type="hidden" id="prev_quantity_transferred_<?=$tr['html_id'];?>" name="prev_quantity_transferred_<?=$tr['html_id'];?>" value="<?=$tr['quantity']?>">
                            </td>

                            <td>
                                <?php
$all_items_array = $this->db->get_where('items')->result_array();
	?>
                                <select required="true" class="form-control" onchange="change_fields($('#item_transferred_<?=$tr['html_id'];?>').val(), $('#item_transferred_<?=$tr['html_id'];?>').attr('id').replace(/[^\d]+/, ''))" name="item_transferred_<?=$tr['html_id'];?>" id="item_transferred_<?=$tr['html_id'];?>">
                                    <option value="">Choose Item</option>
                                    <?php foreach ($all_items_array as $item): ?>
                                        <option value="<?=$item['item_id'];?>" <?php if ($item['item_id'] === $tr['item_id']) {
		echo 'selected';
	}
	?>><?=$item['item_name'];?></option>
                                    <?php endforeach;?>
                                </select>
                            </td>

                            <td id="description_td_<?=$tr['html_id'];?>"><?=$this->db->get_where('items', array('item_id' => $tr['item_id']))->row()->description;?>
                            </td>

                            <td width="180">
                                <input type="text" min="1" readonly="readonly" class="form-control btn btn-success btn-lg" id="available_quantity_<?=$tr['html_id'];?>" name="available_quantity_<?=$tr['html_id'];?>" value="<?=number_format($this->db->get_where('items', array('item_id' => $tr['item_id']))->row()->quantity, 2, '.', ',');?>">

                                <input type="hidden" id="hidden_available_quantity_<?=$tr['html_id'];?>" name="hidden_available_quantity_<?=$tr['html_id'];?>" value="<?=$this->db->get_where('items', array('item_id' => $tr['item_id']))->row()->quantity;?>">
                                <input type="hidden" id="hidden_available_quantity2_<?=$tr['html_id'];?>" name="hidden_available_quantity2_<?=$tr['html_id'];?>" value="<?=$this->db->get_where('items', array('item_id' => $tr['item_id']))->row()->quantity;?>">


                            </td>

                            <td width="60">
                                <a href="javascript:;" onclick="remove_row('<?=$table_row_counter;?>')" class="btn btn-danger btn-lg"><i class="fa fa-fw fa-trash"></i></a>
                            </td>
                            </tr>
                            <?php

	$table_row_counter++;
	endforeach;
	?>

                    </tbody>

                </table>
            </div>

            <hr>
            <div class="row">
                <div class="col-md-8 col-sm-8 col-lg-8"></div>
                <div class="col-md-4 col-sm-4 col-lg-4" style="text-align: right">
                    <a href="javascript:;" onclick="add_new_item_row()" class="btn btn-info btn-lg" style="text-align: right">Add Item</a>
                </div>
            </div>
            <hr>

            <div class="form-group row">
                <div class="col-md-6 col-sm-6">
                    <div class="col-sm-12 col-md-12">
                        <table width="100%">
                            <thead>
                                <tr>
                                    <th>Total Quantity:</th>
                                    <th><strong><span id="total"><?=number_format($tr['total_quantity'], 2, '.', ',');?></span></strong></th>
                                </tr>
                                <input type="hidden" name="hidden_total_quantity" id="hidden_total_quantity" value="<?=$tr['total_quantity']?>">

                            </thead>
                        </table>

                        <hr><hr>


            <div class="form-group row">
                <div class="col-sm-6 col-md-6 col-xs-6">
                    <input type="submit" class="btn btn-success btn-lg"
                        value="UPDATE TRANSFER">
                </div>
                <div class="col-sm-4 col-md-4 col-xs-6">
                    <button class="btn btn-danger btn-lg" data-dismiss="modal">CANCEL</button>
                </div>
                <div class="col-sm-2 col-md-2 col-xs-6"></div>
            </div>
          </form>
          </div>

          </div>
        </div>
    </div>
</div>

        <?php

} else {

	echo '<center><h4 class="btn btn-danger btn-lg">No Data Found!</h4></center>';
}
?>

<script type="text/javascript">
    $(function() {
        let table_row_counter = <?php echo $table_row_counter; ?>;

        //enable the last button
        //$('#tr_' + (Number(table_row_counter) - 1) + ' td a').removeAttr('disabled');
      });


    $('#transfer_date').change(function(event) {
        /* Act on the event */
        //clear all table rows and inputs if Customer is changed
        $('#s_order_create_table tbody tr').css('display', 'none');
        $('#s_order_create_table tbody tr').slideUp('slow');
        $('#s_order_create_table tbody tr').remove();
    });



    //add row to table at a button click
    function add_new_item_row() {

        //be sure user selected customer before trying to add row
        let selected_receiver = $('#transfer_to').val();
        if(selected_receiver == '') {
            //no customer selected, flag error message
            showAjaxModal_confirm('No Receiver Was Specified! Indicate where you are transferring the item(s) to and try again.', 'Error');
            return false;
        }

        let tbody = $('#item_transfer_create_table tbody').find('tr').length + 1;

        let transfer_date = $('#transfer_date').val();

        //trying to make sure that a selected item does not appear in the next row
        let selected_item_ids = [];
        let i = 1;
        $.each($('tr td select'), function(index, val) {

             /* iterate through array or object */
                selected_item_ids.push($('#tr_'+ i +' td select').val());
            i++;
        });

        selected_item_ids = selected_item_ids.join('-');


        $.ajax({
            url: '<?php echo site_url('admin/add_item_transfer_row/') ?>'+ selected_item_ids + '/edit',
            type: 'POST',
            dataType: 'html',
            cache: false
        })
        .done(function(data) {

            let tr = '<tr id="tr_'+ tbody +'">'+data+'<td width="60"><a href="javascript:;" onclick="remove_row('+tbody+')" class="btn btn-danger btn-lg"><i class="fa fa-fw fa-trash"></i></a></td></tr>';

            //add row now
            $('#item_transfer_create_table tbody').append(tr);

            //disable the previous delete button
            //$('#tr_' + (Number(tbody) - 1) + ' td a').attr('disabled', 'disabled');
         });
    }




function change_fields(item_id, num) {
        /* Act on the event */

        let ajax_url = '<?php echo site_url('admin/transfer_item_selected/') ?>' + item_id;


        if(item_id != '') {

            $.ajax({
                url: ajax_url,
                type: 'POST',
                dataType: 'json',
            })
            .done(function(response) {

                    $('#description_td_' + num).html(response.description);
                    $('#available_quantity_' + num).val(number_format(response.quantity, 2, '.', ','));
                    $('#hidden_available_quantity_' + num).val(response.quantity);

                    //button colors
                    if(response.quantity < 500 && response.quantity > 200) {
                        $('#available_quantity_' + num).removeClass('btn-success');
                        $('#available_quantity_' + num).removeClass('btn-danger');
                        $('#available_quantity_' + num).addClass('bg-warning');

                    } else if(response.quantity < 200) {
                        $('#available_quantity_' + num).removeClass('btn-success');
                        $('#available_quantity_' + num).removeClass('bg-warning');
                        $('#available_quantity_' + num).addClass('btn-danger');

                    } else {
                        $('#available_quantity_' + num).removeClass('btn-danger');
                        $('#available_quantity_' + num).removeClass('bg-warning');
                        $('#available_quantity_' + num).addClass('btn-success');
                    }

                    //make the quantity transferred field readonly if total quantity available is 0
                    if(response.quantity == 0) {

                        $('#quantity_transferred_' + num).attr('readonly', 'readonly');
                    } else {

                        $('#quantity_transferred_' + num).removeAttr('readonly');
                    }




            });
        }
}


function grand_total(num) {

    let total_quantity = 0;
    const hidden_available_quantity = Number($('#hidden_available_quantity_' + num).val());
    const quantity_transferred = Number($('#quantity_transferred_' + num).val());

    const prev_qt = Number($('#prev_quantity_transferred_' + num).val());

    $('tbody tr').each(function() {
        //sum up the quantity
        $(this).find('td .sum_total_quantity_transferred').each(function() {
            total_quantity = total_quantity + Number($(this).val());
        });

    });

    //for quantity
    $('#total').html(number_format(total_quantity, 2, '.', ','));
    $('#hidden_total_quantity').val(total_quantity);

    $('#available_quantity_' + num).val(number_format((hidden_available_quantity - quantity_transferred) + prev_qt, 2, '.', ','));

    $('#hidden_available_quantity2_' + num).val((hidden_available_quantity - quantity_transferred) + prev_qt);

        let avq = Number($('#hidden_available_quantity2_' + num).val());
                //button colors
                    if(avq < 500 && avq > 200) {
                        $('#available_quantity_' + num).removeClass('btn-success');
                        $('#available_quantity_' + num).removeClass('btn-danger');
                        $('#available_quantity_' + num).addClass('bg-warning');
                    } else if(avq < 200) {
                        $('#available_quantity_' + num).removeClass('btn-success');
                        $('#available_quantity_' + num).removeClass('bg-warning');
                        $('#available_quantity_' + num).addClass('btn-danger');
                    } else {
                        $('#available_quantity_' + num).removeClass('btn-danger');
                        $('#available_quantity_' + num).removeClass('bg-warning');
                        $('#available_quantity_' + num).addClass('btn-success');
                    }
}

 //reemove row
function remove_row(id) {

    //quantities
    let row_total_quantity = Number($('#tr_' + id + ' td .sum_total_quantity_transferred').val());
    let grand_total_quantity = Number($('#hidden_total_quantity').val());
    let balance_quantity = grand_total_quantity - row_total_quantity;


    $('#total').html(number_format(balance_quantity, 2, '.', ','));

    $('#hidden_total_quantity').val(balance_quantity);

    //enable the previous button
    //$('#tr_' + (Number(id) - 1) + ' td a').removeAttr('disabled');

    //remove row now
    $('#tr_'+id).remove();
}


    //item transfer form submitted
 $('#items_transfer_form').submit(function(event) {
    /* Act on the event */
    event.preventDefault();

    let no_tr = $('#items_transfer_form tbody').find('tr').length;
    let input_ids_numeric = []; //array to hold the numeric parts of the ids

    for(i = 1; i <= no_tr; i++) {
      let each_id_numeric =  $('#tr_' + i + ' input[type="number"]').attr('id').replace(/[^\d]+/, '');

      input_ids_numeric.push(each_id_numeric); //push the numbers into this array
    }



    //replace the , with -
    input_ids_numeric = input_ids_numeric.join('-')
    let form_data = $('#items_transfer_form').serialize();

    //send data via ajax

    $.ajax({
      url: '<?php echo site_url('admin/items_transfer/update/' . $token_number . '/') ?>' + input_ids_numeric,
      type: 'POST',
      dataType: 'json',
      data: form_data,
      cache: false
    })
    .done(function(data) {
      if(data.success == true) {
        $('.close').click();
        showAjaxModal_confirm('Item Transfer Updated Successfully.', 'Success');

        setTimeout(() => {
          $('#modal_confirm .close').click(); //window.location.reload();
        }, 3000);
      }  else {
        $(function(){
          $.each(data, function(index, val) {
          $('#list_err_items_transfer_update').append('<li>' + val + '</li>');
        }); });

        //$('.close').click();
        showAjaxModal_confirm('<ul id="list_err_items_transfer_update"></ul>', 'Error');
      }
    })
    .fail(function(err) {
        showAjaxModal_confirm(err.responseText, 'Error');
    });
  });

    function remove_this_row(id) {
        //remove row now
        $('#tr_'+id).remove();
    }

</script>