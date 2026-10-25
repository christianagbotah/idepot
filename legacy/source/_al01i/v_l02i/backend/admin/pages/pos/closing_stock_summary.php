<style type="text/css">
    .imgcircle2 {
        transition: transform 0.6s;
    }
    .img-circle2:hover {
        transition: transform 0.6s;
        transform-style: all;
        transform: scale(3);
    }
</style>

<?php 
    //currency
    $currency = $this->db->get_where('settings', array('type' => 'currency'))->row()->description;
    $fmt = new NumberFormatter('en_US', NumberFormatter::CURRENCY);
    $user_id = $param2;
?>
<div class="container">
    <?php
        $this->db->select_max('date_timestamp');
        $this->db->where('user_id', $user_id);
        $date_timestamp = $this->db->get('stock_manager')->row()->date_timestamp;

        //the main query now
        $this->db->where('date_timestamp', $date_timestamp);
        $this->db->where('user_id', $user_id);
        $all_tems = $this->db->get('stock_manager');
        $all_tems_array = $all_tems->result_array();

        $total_q = 0;
     ?>
    <hr>
    <div class="row">
        <table class="table table-striped table-hover table-active" width="100%" id="item_list">
            <thead class="bg-info">
              <tr>
                <th style="text-align: center">item Image</th>
                <th>Item Name</th>
                <th style="text-align: right">Quantity</th>
                <th style="text-align: right">Last Used Date</th>
              </tr>
            </thead>
            <tbody>
                <?php 
                    foreach($all_tems_array as $item):
                        $total_q += $item['closing_stock'];
                        $total_q += $item['stock_in_today'];
                        
                        $item_name = $this->db->get_where('items', array('item_id' => $item['item_id']))->row()->item_name;
                        $last_used_date = $this->db->get_where('items', array('item_id' => $item['item_id']))->row()->last_used_timestamp;
                ?>
              <tr>
                <td align="center" >
                    <img src="<?php echo $this->crud_model->get_image_url('item',$item['item_id']);?>" class="img-circle2" width="50" />
                </td>
                <td style="vertical-align: middle;"><?= $item_name; ?></td>
                <td align="right" style="vertical-align: middle;"><strong><?= number_format($item['closing_stock'], 0, '.', ','); ?></strong></td>
                <td align="right" style="vertical-align: middle;"><?php if($last_used_date != null) echo date('d-m-Y H:i:s', $last_used_date); ?></td>
              </tr>
              <?php

               endforeach; ?>
            </tbody>
        </table>
    </div>
    <br>
    <hr>
    <div class="row">
            <div class="col-md-4 col-sm-4 text-lg-left"><strong class="text-dark">No Of Stock: <?= number_format($all_tems->num_rows(), 0, '.', ','); ?></strong></div>
            <div class="col-md-8 col-sm-8 text-lg-left"><strong class="text-dark">Total Stock <?= number_format($total_q, 0, '.', ','); ?> Bags</strong></div>

    </div>
</div><hr>

<script type="text/javascript">
    $(function() {

        $('#print_data').removeAttr('href');
        $('#print_data').attr('href', '<?php echo site_url('admin/backlog_report/closing_stock/'.$user_id) ?>');
        $('#print_data').slideDown('fast'); //show the print button
    });
</script>


