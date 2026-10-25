
<?php

  echo '<script src="'. base_url(). 'assets/js/neon-custom-ajax.js"></script>
    <script type="text/javascript">

      $(function() {
        $(".select2").select2({
          theme: "classic"
          });
        
      })
      
    </script>';
?>

<div class="form-group row">
	<div class="col-sm-12 col-lg-12 col-md-12 col-xs-12">
		<select required="true" class="form-control select2" id="selection" style="width: 100%">
	    <option value="">Select item</option>
	    <?php 
	    	$this->db->where_not_in('item_id', $items_ids);
	    	$items_array = $this->db->get('items')->result_array();

				foreach($items_array as $item):
			 ?>
	    <option value="<?=$item['item_id'] ?>"><?=$item['item_name']; ?></option>
	    <?php endforeach;?>
		</select>
	</div>
</div>
          
     