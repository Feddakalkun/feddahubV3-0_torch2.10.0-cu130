import { Txt2ImgPage } from '../zimage/ZImageTxt2Img';

/**
 * FLUX2-KLEIN unfiltered text-to-image.
 *
 * One page where there were two. "Unfiltered" and "Unfiltered v2" were never
 * two models: both loaded nsfwKlein.safetensors with qwen_3_8b_fp8mixed and
 * flux2-vae, from the same downloader node carrying the same three links. What
 * differed was that one graph had a LoRA node and the other did not - and that
 * alone decided which page each got, this rich one or the generic slider page,
 * which is why the two tabs looked unrelated.
 *
 * The merged graph settles it by keeping the Flux2-Klein-9B consistency LoRA on
 * a node of its own, always in circuit, with the user's stack chained after it.
 *
 * Same controls as the standard FLUX page: the graph differs in the checkpoint
 * and that baked LoRA, not in anything the user sets.
 */
export const FluxKleinTxt2ImgV2 = () => {
  return (
    <Txt2ImgPage
      storageKey="flux2klein_txt2img_v2"
      workflowId="flux2klein-txt2img-v2"
      familyLabel="FLUX"
      capabilityLabel="Unfiltered"
      promptContext="flux2-klein"
      accent="violet"
      // FLUX.1-dev LoRAs have incompatible dimensions and cause matmul errors.
      loraPrefixes={['flux2klein/']}
      loraPacks={['flux2klein']}
      defaultSteps={8}
      maxSteps={20}
      defaultCfg={1}
      showCfgControl
      minCfg={0.8}
      maxCfg={2}
      characterPromptLabel="Character / Trigger"
      characterPromptPlaceholder="LoRA identity phrase, trigger words, hair, face, body, outfit"
    />
  );
};
