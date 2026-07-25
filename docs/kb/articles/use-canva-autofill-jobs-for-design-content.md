Use `CANVA_INITIATE_CANVA_DESIGN_AUTOFILL_JOB` when a Canva workflow must insert content into a generated design. The autofill workflow accepts a brand template and its input data, then creates the populated design asynchronously.

`CANVA_CREATE_CANVA_DESIGN_WITH_OPTIONAL_ASSET` is deprecated in favor of `CANVA_POST_DESIGNS`, but both create-design flows create a blank design by default and do not accept arbitrary design content. Use `CANVA_POST_DESIGNS` only when a blank design is the intended result.
