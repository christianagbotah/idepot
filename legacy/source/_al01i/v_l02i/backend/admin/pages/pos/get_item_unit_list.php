<?php
	$this->db->where('item_id', $item_id);
	$array = $this->db->get('units_items')->result_array();
?>

<select class="form-control" name="item_unit" id="item_unit" onchange="updateYesButtonLink($(this).val(), <?=$from_pos;?>)">

	<option value="">Select Other Unit</option>
	<?php
		foreach($array as $unit):

			$unit_name = $this->db->get_where('units', ['unit_id' => $unit['unit_id']])->row()->unit_name;
			?>

			<option value="<?=$unit['unit_id']; ?>"><?=$unit_name; ?></option>
			<?php

		endforeach;

	?>
</select>

<script type="text/javascript">
	//update yes button link everytime there's a change in the select
    function updateYesButtonLink(item_unit_id, from_pos) {

      let item_id = $('#hidden_item_id').val();
      let row_id = $('#hidden_row_id').val();
      let unit_name = $('#hidden_unit_name').val();
      let package_name = $('#hidden_package_name').val();
   

      if(from_pos == 1) {
      	//true

      	$('#yes_btn_unit').attr("onclick", "add_new_row_pos("+item_id+", "+item_unit_id+"); $('#confirm_unit').modal('toggle')");

      } else {
      	//not true, coming from item transfer side
      	$('#yes_btn_unit').attr("onclick", "update_item_row("+item_id+", "+item_unit_id+", "+row_id+", "+unit_name+", "+package_name+"); $('#confirm_transfer_unit').modal('toggle')");
      }

      

      
    }
</script>