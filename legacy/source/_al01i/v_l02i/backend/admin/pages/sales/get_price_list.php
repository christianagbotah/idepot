 <?php
         //date duration selection
       // $opening_day =  $this->db->get_where('settings', array('type' => 'opening_day'))->row()->description; 
       // $week_starts_from = date('d-m-Y', strtotime('this week '. $opening_day));
        //$week_ends_on = date('d-m-Y');


        $items_ids_array = [];



                      //items query
                      $this->db->select('item_id');
                      $this->db->distinct();
                      $this->db->where('customer_id', $customer_id);
                      $this->db->order_by('item_id', 'asc');  
                      $items_array = $this->db->get('items_prices');

                      if(!empty($customer_id) || $customer_id != '') {
                      $this->db->where('customer_id', $customer_id);
                      $customer_array = $this->db->get('customers');


                        if($customer_array->num_rows() > 0) {
                          $customer_name = $customer_array->row()->customer_name;


                          $resp = 'exists';
                        } else {
                          $resp = 'not exist';
                        } 

                      } else {
                          $resp = 'no customer selected';
                      } 

                ?>

                <style type="text/css">
                  th {
                    position: sticky; 
                    top: 0; 
                    background: black;
                    color: #fff;
                    box-shadow: 0px 2px 8px red;
                  }

                  #submit_button {
                    position: -webkit-sticky;
                    position: sticky;
                    top: 20px;
                  }

                  ::placeholder {
                     color: grey !important;
                  }
                </style>

                <?php
                  if($resp == 'exists') { ?>
                <div class="d-flex flex-row mb-3" id="submit_button">
                    <div class="col-lg-8 col-sm-8 col-md-8">
                      <div class="font-weight-bold">CUSTOMER'S NAME: <u><?=$customer_name; ?></u></div>
                    </div>
                    <div class="col-lg-4 col-sm-4 col-md-4" style="text-align: right">
                      <input type="submit" name="submit" class="btn btn-info btn-lg " style="display: inline" value="UPDATE PRICES" id="submit">
                    </div>

                </div>

                <div class="d-flex flex-row mb-3">
                  <input type="search" class="form-control" name="item_filter" id="item_filter" placeholder="Filter product..." style="height: 35px;">
                </div>

                <div class="form-group row">
                    <table class="table table-striped table-hover" width="100%" id="pricing_table" border="1">
                        <thead>
                          <tr>
                            <th style="vertical-align: middle">S/N</th>
                            <th style="vertical-align: middle">PRODUCT NAME</th>
                            <th style="vertical-align: middle">PRODUCT DESCRIPTION</th>
                            <th style="vertical-align: middle" width="150">UNIT PRICES</th>
                          </tr>                          
                        </thead>
                        <tbody>

                          <?php
                          $i = 1;
                          if($items_array->num_rows() > 0) {
                            $items_result = $items_array->result_array();


                            foreach($items_result as $item) {


                              $this->db->where('customer_id', $customer_id);
                              $this->db->where('item_id', $item['item_id']);
                              $item_price = $this->db->get('items_prices')->row()->item_price;

                              //query items table
                              $this->db->where('item_id', $item['item_id']);
                              $item_row = $this->db->get('items')->row();

                              $isSoldInUnit = $item_row->item_sold_in_units;

                              echo '<tr>';
                                ?>
                                <td>
                                    <?=$i?>   
                                </td>
                                <td>
                                    <div class="font-weight-bold"><?=$item_row->item_name;?></div>
                                    <input type="hidden" name="item_<?=$item['item_id'] ?>" value="<?=$item['item_id'] ?>">
                                    
                                </td>
                                <td>
                                    <div class="text-black-50"><?=$item_row->description;?></div>                                   
                                </td>
                                <td>
                                  <?php
                                    if($isSoldInUnit > 0):
                                       /*it's sold in unit*/

                                      $package_id = $item_row->package_id;
                                      $package_name = $this->db->get_where('packages', ['package_id' => $package_id])->row()->package_name;

                                      $unit_row = $this->db->get_where('units_items', ['item_id' => $item['item_id']])->row();
                                      $unit_id = $unit_row->unit_id;

                                      $unit_price_query = $this->db->get_where('items_units_prices', ['item_id' => $item['item_id'], 'customer_id' => $customer_id, 'unit_id' => $unit_id]);
                                      $unit_price = $unit_row->unit_price;

                                      if($unit_price_query->num_rows() > 0) {
                                        $unit_price = $unit_price_query->row()->item_price;
                                      }
                                        

                                      $unit_name = $this->db->get_where('units', ['unit_id' => $unit_id])->row()->unit_name;
                                  ?>
                                    <div class="form-group row bg-warning">
                                      <div class="col-md-6 col-lg-6 col-sm-6">
                                        <label class="col-md-12 col-lg-12 col-sm-12"><small style="font-size: 7px"><?=$package_name;?></small></label>
                                        <input type="text" class="form-control" name="price_<?=$item['item_id'].$customer_id ?>" id="price_<?=$item['item_id'].$customer_id ?>" value="<?=$item_price?>">
                                      </div>

                                      <!-- prices for each unit -->
                                      <div class="col-md-6 col-lg-6 col-sm-6">
                                        <label class="col-md-12 col-lg-12 col-sm-12"><small style="font-size: 7px"><?=$unit_name;?></small></label>
                                        <input type="text" class="form-control" name="unit_price_<?=$item['item_id'].$customer_id ?>" id="unit_price_<?=$item['item_id'].$customer_id ?>" value="<?=$unit_price?>">

                                        <input type="hidden"name="unit_id_<?=$item['item_id'].$customer_id ?>" id="unit_id_<?=$item['item_id'].$customer_id ?>" value="<?=$unit_id?>">
                                      </div>
                                    </div>

                                    <?php
                                  else:
                                    /*it's not sold in unit*/
                                    ?>
                                    <input type="text" class="form-control" name="price_<?=$item['item_id'].$customer_id ?>" id="price_<?=$item['item_id'].$customer_id ?>" value="<?=$item_price?>">
                                    <?php
                                  endif;
                                    ?>
                                </td>
                              </tr>
                                <?php
                                $items_ids_array[] = $item['item_id'];

                                $i++;
                            }
                          }
                          ?> 

                                <?php
    
                          
                          } else if($resp == 'not exists') {
                            ?>
                            <tr>
                              <td colspan="<?=$items_array->num_rows() + 2; ?>" align="center">No Record Found</td>
                            </tr>
                            <?php

                          } else if($resp == 'no customer selected') {
                            ?>
                            <tr>
                              <td colspan="4" align="center">No customer selected. Please select one</td>
                            </tr>
                            <?php

                          }

                           
                          ?> 
                        </tbody>
                    </table>
                </div>
                <div class="clearfix">
                  <a href="javascript:void(0);" id="removeLastRow" onclick="removeLastRow()" class="btn btn-sm btn-danger rounded-circle float-right ml-2" title="Remove item row"><i class="fa fa-close"></i></a>

                  <a href="javascript:void(0);" id="addNewRow" onclick="addNewRow()"  class="btn btn-sm btn-success rounded-circle float-right" title="Add item row"><i class="fa fa-plus"></i></a>
                </div>



<script type="text/javascript">
      var customer_id = '';
      var items_ids_numeric = [];
      
      $(function(e) {
        $("#item_filter").on("keyup", function() {
          var value = $(this).val().toLowerCase();
          $("#pricing_table tbody tr").filter(function() {
            $(this).toggle($(this).text().toLowerCase().indexOf(value) > -1)
          });
        });

        //add items to the list
        items_ids_numeric = <?php echo json_encode($items_ids_array); ?>;
        customer_id = <?php echo $customer_id; ?>;

        var tableHeight = $('#pricing_form').height();

        tableHeight = tableHeight / 2;

        var mHeight = tableHeight - 400;

      });

      

       
      function addNewRow() {

        $('html, body').animate({
              scrollTop: ($('#top').offset().top )
          }, 1000);
   
        customer_id = '<?=$customer_id;?>';

        let currentTR = $('#pricing_form tbody').find('tr').length;

        $('#modal_confirm').css({
          zIndex: '9999',
          maxHeight: '40%',
        });

        $('#modal_confirm .modal-dialog').css({
          marginTop: '60px'
        });

        $.ajax({
          url: '<?php echo site_url('admin/get_items_list') ?>',
          type: 'POST',
          dataType: 'html',
          data: {'items_ids': items_ids_numeric},
          cache: false,
        })
        .done(function(response) {
          let sendUrl = '<?php echo site_url('admin/addItemToPriceList/'); ?>' + currentTR;

          confirm_action_modal('add_item', sendUrl, customer_id, response, 'pricing_form', 'MAKE SELECTION', function(item_id) {

            items_ids_numeric.push(item_id);
          });
        })
        .fail(function(err) {
          showAjaxModal_confirm(error.responseText, 'Error');
        })
        
      }


      
    
      



      //filter names here
      /*$("#nameSearch").on("keyup", function() {
        tableHeight = $('#pricing_form').height();
        tableHeight = tableHeight / 2;
        mHeight = -50;// tableHeight - 10; //change the value of the margin top

        var value = $(this).val().toLowerCase();
        $("#pricing_table tbody tr").filter(function() {
          $(this).toggle($(this).text().toLowerCase().indexOf(value) > -1)
        });
      });*/

      


   



</script>
